# Access keys can be referenced from the command line via terraform plan -var "access_key=key"

variable "access_key"{
  type = "string"
  default = ""
}
variable "secret_key"{
  type = "string"
  default = ""
}

# Configure the Alicloud Provider

provider "alicloud" {
  access_key = "${var.access_key}"
  secret_key = "${var.secret_key}"
  region     = "${var.region}"
}
variable "region" {
    type = "string"
    default = "us-east-1" //Default Region

}
data "alicloud_account" "current"{

}

variable "cluster_name"{
    type = "string"
    default = "FortigateAutoScale"
}
//Get Instance types with min requirements in the region.
data "alicloud_instance_types" "types_ds" {
  cpu_core_count = 2
  memory_size = 8
  instance_type_family = "ecs.g5"//"ecs.sn2ne"
}

data "alicloud_regions" "current_region_ds" {
  current = true
}
data "alicloud_zones" "default" {}
//Create a Random String to be used for the PSK secret.
resource "random_string" "psk" {
  length = 16
  special = true
  override_special = ""

}
//Random 3 char string appended to the ened of each name to avoid conflicts
//If you increase this number you will need to adjust OTS name since it will exceed the max 16 chars.
resource "random_string" "random_name_post" {
  length = 3
  special = true
  override_special = ""
  min_lower = 3
}
resource "alicloud_ram_role" "ram_role" {
  name = "${var.cluster_name}-Logging-Role-${random_string.random_name_post.result}"
  services = ["fc.aliyuncs.com"]
  description = "AutoScale Logging and describe vpc Role, created by Terraform"
  force = true
   depends_on = ["alicloud_ram_policy.policy", "alicloud_ram_policy.policy_vpc"]
}

resource "alicloud_ram_policy" "policy" {
  name = "${var.cluster_name}-Logging-Policy-${random_string.random_name_post.result}"
  depends_on = ["alicloud_log_project.AutoScaleLogging", "alicloud_log_store.AutoScaleLogging-Store"]
  statement = [
    {
      action = [
        "log:PostLogStoreLogs"
      ],
      resource = ["acs:log:*:*:project/${alicloud_log_project.AutoScaleLogging.name}/logstore/${alicloud_log_store.AutoScaleLogging-Store.name}"],
      effect = "Allow"
    }
  ]
  description = "FortiGate AutoScale Logging Policy"
  force = true
}
//The following Policy is required to allow the Function to join the VPC
resource "alicloud_ram_policy" "policy_vpc" {
  name = "${var.cluster_name}-function-vpc-policy-${random_string.random_name_post.result}"
   statement = [
    {
      action = [
        "vpc:DescribeHaVip*",
        "vpc:DescribeRouteTable*",
        "vpc:DescribeRouteEntry*",
        "vpc:DescribeVSwitch*",
        "vpc:DescribeVRouter*",
        "vpc:DescribeVpc*",
        "vpc:Describe*Cen*",
        "ecs:CreateNetworkInterface",
        "ecs:DescribeNetworkInterfaces",
        "ecs:CreateNetworkInterfacePermission",
        "ecs:DescribeNetworkInterfacePermissions",
        "ecs:DeleteNetworkInterface"

      ],
      resource = ["*"],
      effect = "Allow"
    }
  ]
  description = "FortiGate AutoScale VPC Policy - Used to bind vpc to function compute during automated deploy"
  force = true
}
resource "alicloud_ram_role_policy_attachment" "attach"{
  policy_name = "${alicloud_ram_policy.policy.name}"
  policy_type = "${alicloud_ram_policy.policy.type}"
  role_name = "${alicloud_ram_role.ram_role.name}"
}
resource "alicloud_ram_role_policy_attachment" "attach_vpc"{
  policy_name = "${alicloud_ram_policy.policy_vpc.name}"
  policy_type = "${alicloud_ram_policy.policy_vpc.type}"
  role_name = "${alicloud_ram_role.ram_role.name}"

}
resource "alicloud_vpc" "vpc" {
  cidr_block = "172.16.0.0/16"
  name = "${var.cluster_name}-${random_string.random_name_post.result}"
}


resource "alicloud_vswitch" "vsw" {
  vpc_id            = "${alicloud_vpc.vpc.id}"
  cidr_block        = "172.16.0.0/21"
  availability_zone = "${data.alicloud_zones.default.zones.0.id}"
}
//zone B
resource "alicloud_vswitch" "vsw2" {
  vpc_id            = "${alicloud_vpc.vpc.id}"
  cidr_block        = "172.16.8.0/21"
  availability_zone = "${data.alicloud_zones.default.zones.1.id}"
}


resource "alicloud_slb" "default" {
  name                 = "${var.cluster_name}.SLB-${random_string.random_name_post.result}"
  internet             = true
  internet_charge_type = "PayByTraffic"
  bandwidth            = 5
  specification = "slb.s1.small"
  master_zone_id       = "${data.alicloud_zones.default.zones.0.id}"//first available zone
  slave_zone_id        = "${data.alicloud_zones.default.zones.1.id}"//second available zone.
}
resource "alicloud_slb_acl" "acl" {
  name = "${var.cluster_name}-ACL-${random_string.random_name_post.result}"
  ip_version = "ipv4"
  entry_list = [
    {
      entry="10.10.10.0/24"
      comment="first"
    },
    {
      entry="168.10.10.0/24"
      comment="second"
    },
    {
      entry="172.10.10.0/24"
      comment="third"
    },
  ]
}
resource "alicloud_slb_listener" "http" {
  load_balancer_id = "${alicloud_slb.default.id}"
  backend_port = 443
  frontend_port = 443
  health_check = "on"
  bandwidth = 100
  health_check_connect_port = 443
  protocol = "tcp"
  sticky_session = "on" //Persistent session
  sticky_session_type = "server" //Fortigate Serves the cookie.
  cookie = "FortiGateAutoScaleSLB"
  cookie_timeout = 86400
  persistence_timeout = 3600
  acl_status                = "off"
  acl_type                  = "white"
  acl_id                    = "${alicloud_slb_acl.acl.id}"
}
//Internal SLB
resource "alicloud_slb" "internal_default" {
  name                 = "${var.cluster_name}.SLB-internal-${random_string.random_name_post.result}"
  internet             = false
  internet_charge_type = "PayByTraffic"
  instance_charge_type = "PostPaid"
  bandwidth            = 100
  specification = "slb.s1.small"
  master_zone_id       = "${data.alicloud_zones.default.zones.0.id}"//first available zone
  slave_zone_id        = "${data.alicloud_zones.default.zones.1.id}"//second available zone.
  vswitch_id = "${alicloud_vswitch.vsw2.id}"
}
resource "alicloud_slb_listener" "tcp_internal" {
  load_balancer_id = "${alicloud_slb.internal_default.id}"
  backend_port = 443
  frontend_port = 443
  health_check = "on"
  health_check_connect_port = 443
  bandwidth = 100
  protocol = "tcp"
  sticky_session = "on" //Persistent session
  sticky_session_type = "server" //Fortigate Serves the cookie.
  cookie = "FortiGateAutoScaleSLB"
  cookie_timeout = 86400
  persistence_timeout = 3600
}
//Security Group ESS instances
resource "alicloud_security_group" "SecGroup" {
  name        = "${var.cluster_name}-SecGroup-${random_string.random_name_post.result}"
  description = "New security group"
  vpc_id = "${alicloud_vpc.vpc.id}"
}
//Security Group Function Instances
resource "alicloud_security_group" "SecGroup_FC" {
  name        = "${var.cluster_name}-SecGroup-FC-${random_string.random_name_post.result}"
  description = "New security group"
  vpc_id = "${alicloud_vpc.vpc.id}"
}
//Allow All Ingress for Firewall
resource "alicloud_security_group_rule" "allow_all_tcp_ingress" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "1/65535"
  priority          = 1
  security_group_id = "${alicloud_security_group.SecGroup.id}"
  cidr_ip           = "0.0.0.0/0"
}
//Allow All Egress Traffic - ESS
resource "alicloud_security_group_rule" "allow_all_tcp_egress" {
  type              = "egress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "1/65535"
  priority          = 1
  security_group_id = "${alicloud_security_group.SecGroup.id}"
  cidr_ip           = "0.0.0.0/0"
}
//Allow Private Subnets to access function compute
resource "alicloud_security_group_rule" "allow_a_class_ingress" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "1/65535"
  priority          = 1
  security_group_id = "${alicloud_security_group.SecGroup_FC.id}"
  cidr_ip           = "10.10.0.0/8"
}
resource "alicloud_security_group_rule" "allow_b_class_ingress" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "1/65535"
  priority          = 1
  security_group_id = "${alicloud_security_group.SecGroup_FC.id}"
  cidr_ip           = "172.16.0.0/12"
}
resource "alicloud_security_group_rule" "allow_c_class_ingress" {
  type              = "ingress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "1/65535"
  priority          = 1
  security_group_id = "${alicloud_security_group.SecGroup_FC.id}"
  cidr_ip           = "192.168.0.0/16"
}
//Allow All Egress Traffic - Function Compute
resource "alicloud_security_group_rule" "allow_all_tcp_egress_FC" {
  type              = "egress"
  ip_protocol       = "tcp"
  nic_type          = "intranet"
  policy            = "accept"
  port_range        = "1/65535"
  priority          = 1
  security_group_id = "${alicloud_security_group.SecGroup_FC.id}"
  cidr_ip           = "0.0.0.0/0"
}
data "alicloud_images" "ecs_image" {
  owners = "marketplace"
  most_recent = true
  name_regex  = "^Fortinet FortiGate"// Grab the latest Image from marketplace.
}

resource "alicloud_ess_scaling_group" "scalinggroups_ds" {

  // Autoscaling Group
  depends_on = ["alicloud_slb_listener.http", "alicloud_slb_listener.tcp_internal"]
  scaling_group_name = "${var.cluster_name}-${random_string.random_name_post.result}"
  min_size           = 2
  max_size           = 3
  removal_policies   = ["OldestInstance", "NewestInstance"]
  vswitch_ids = ["${alicloud_vswitch.vsw.id}", "${alicloud_vswitch.vsw2.id}"]
  multi_az_policy = "BALANCE"


  loadbalancer_ids = [
    "${alicloud_slb.default.id}",
    "${alicloud_slb.internal_default.id}"
  ]
}
//Scaling Config

resource "alicloud_ess_scaling_configuration" "config" {

  force_delete = true
  scaling_group_id  = "${alicloud_ess_scaling_group.scalinggroups_ds.id}"
  image_id          = "${data.alicloud_images.ecs_image.images.0.id}" //grab the first image that matches the regex
  instance_type     = "${data.alicloud_instance_types.types_ds.instance_types.0.id}"//Grab the first instance that meets the requirements. Default 2 Cpu 8GB memory.
  security_group_id = "${alicloud_security_group.SecGroup.id}"
  internet_charge_type = "PayByTraffic"
  active = true
  enable = true
  user_data = "{'config-url':'https://${data.alicloud_account.current.id}.${var.region}-internal.fc.aliyuncs.com/2016-08-15/proxy/${alicloud_fc_service.fortigate-autoscale-service.name}/${alicloud_fc_function.fortigate-autoscale.name}/'}"
  depends_on = ["alicloud_fc_service.fortigate-autoscale-service","alicloud_fc_function.fortigate-autoscale","alicloud_fc_trigger.httptrigger","alicloud_oss_bucket_object.object-content","alicloud_ots_instance.tablestore"]
  internet_max_bandwidth_in = 200
  internet_max_bandwidth_out = 100
  data_disk = {
    size = 30,
    category = "cloud_ssd",
    delete_with_instance = true
  }
}

//Scaling Rule
//Scale Out
resource "alicloud_ess_scaling_rule" "scale_out" {
  scaling_group_id = "${alicloud_ess_scaling_group.scalinggroups_ds.id}"
  scaling_rule_name = "ScaleOut"
  adjustment_type  = "QuantityChangeInCapacity"
  adjustment_value = 1
  cooldown         = 60
}
//Scale In
resource "alicloud_ess_scaling_rule" "scale_in" {
  scaling_group_id = "${alicloud_ess_scaling_group.scalinggroups_ds.id}"
  scaling_rule_name = "ScaleIn"
  adjustment_type  = "QuantityChangeInCapacity"
  adjustment_value = -1
  cooldown         = 60
}
//Scaling Alarm
//Scale Out
resource "alicloud_ess_alarm" "cpu_alarm_scale_out" {
    name = "Fortigate_cpu_alarm_scale_out__${random_string.random_name_post.result}"
    description = "FortiGate AutoScaleCPU utilization alert"
    //Ari is the unique identifier for a scaling rule
    alarm_actions = ["${alicloud_ess_scaling_rule.scale_out.ari}"]
    scaling_group_id = "${alicloud_ess_scaling_group.scalinggroups_ds.id}"
    metric_type = "system"
    metric_name = "CpuUtilization"
    //Average over 300 seconds - only supports 60/120/300/900
    period = 300
    statistics = "Average"
    threshold = 60
    comparison_operator = ">="
    evaluation_count = 3
}

//Scale In
resource "alicloud_ess_alarm" "cpu_alarm_scale_in" {
    name = "Fortigate-cpu_alarm_scale_in_${random_string.random_name_post.result}"
    description = "FortiGate AutoScaleCPU utilization alert"
    //Ari is the unique identifier for a scaling rule
    alarm_actions = ["${alicloud_ess_scaling_rule.scale_in.ari}"]
    scaling_group_id = "${alicloud_ess_scaling_group.scalinggroups_ds.id}"
    metric_type = "system"
    metric_name = "CpuUtilization"
    //Average over 900 seconds - only supports 60/120/300/900
    period = 900
    statistics = "Average"
    threshold = 35
    comparison_operator = "<="
    evaluation_count = 3
}

// Create an OTS instance
resource "alicloud_ots_instance" "tablestore" {
  name = "FortiGateASG-${random_string.random_name_post.result}" //16 char limit
  description = "TableStore Instance Terraform"
  accessed_by = "Any"
  instance_type = "HighPerformance"
  tags {
    Created = "TF"
    For = "FortiGate AutoScale Table"
  }
}
//Create the Tables
//While not neccessary, we create them here to allow terraform to destroy/manage them
//If they are not created during the terraform apply, they will be created by the function
resource "alicloud_ots_table" "table_FortiAnalyzer" {
  instance_name = "${alicloud_ots_instance.tablestore.name}"
  table_name = "FortiAnalyzer"
  primary_key = [
    {
      name = "instanceId"
      type = "String"
    }
  ]
  time_to_live = "-1"
  max_version = "1"

}
resource "alicloud_ots_table" "table_FortiGateLifecycleItem" {
  instance_name = "${alicloud_ots_instance.tablestore.name}"
  table_name = "FortiGateLifecycleItem"
  primary_key = [
    {
      name = "instanceId"
      type = "String"
    }
  ]
  time_to_live = "-1"
  max_version = "1"

}
resource "alicloud_ots_table" "table_FortiGateMasterElection" {
  instance_name = "${alicloud_ots_instance.tablestore.name}"
  table_name = "FortiGateMasterElection"
  primary_key = [
    {
      name = "asgName"
      type = "String"
    }
  ]
  time_to_live = "-1"
  max_version = "1"

}
resource "alicloud_ots_table" "table_Settings" {
  instance_name = "${alicloud_ots_instance.tablestore.name}"
  table_name = "Settings"
  primary_key = [
    {
      name = "settingKey"
      type = "String"
    }
  ]
  time_to_live = "-1"
  max_version = "1"

}
resource "alicloud_ots_table" "table_FortiGateAutoscale" {
  instance_name = "${alicloud_ots_instance.tablestore.name}"
  table_name = "FortiGateAutoscale"
  primary_key = [
    {
      name = "instanceId"
      type = "String"
    }
  ]
  time_to_live = "-1"
  max_version = "1"

}
// OTS table. If not created in Terraform they will create as part of the AutoScale Function code.
// In this case they will not be managed by Terraform and a destroy will not work


//OSS
 resource "local_file" "LocalConfigWrite" {
    content     = <<EOF
config system dns
   unset primary
   unset secondary
end
config system auto-scale
   set status enable
   set sync-interface {SYNC_INTERFACE}
   set role master
   set callback-url https://${data.alicloud_account.current.id}.${var.region}-internal.fc.aliyuncs.com/2016-08-15/proxy/${alicloud_fc_service.fortigate-autoscale-service.name}/${alicloud_fc_function.fortigate-autoscale.name}/
   set psksecret {PSK_SECRET}

end

    EOF
    filename = "./cloud-init.sh"
}
resource "alicloud_oss_bucket" "FortiGateAutoScaleConfig" {
  bucket = "fortigateautoscaleconfig-${random_string.random_name_post.result}" //Must be in lower case.
  acl = "private"
}

resource "alicloud_oss_bucket_object" "object-content" {
  bucket = "${alicloud_oss_bucket.FortiGateAutoScaleConfig.bucket}"
  key    = "cloud-init.sh"
  source = "./cloud-init.sh"
  depends_on = ["local_file.LocalConfigWrite"]
}

//Create the Function Service
resource "alicloud_fc_service" "fortigate-autoscale-service" {
    depends_on = ["alicloud_ram_role.ram_role"]
    name = "${var.cluster_name}-${random_string.random_name_post.result}" //Removed "service" from name to keep URL under 127 characters.
    description = "Created by terraform"
    internet_access = true
    role = "${alicloud_ram_role.ram_role.arn}"
    log_config = [
    {project = "${alicloud_log_project.AutoScaleLogging.name}"
    logstore = "${alicloud_log_store.AutoScaleLogging-Store.name}"
    }
    ]
    vpc_config = [
    {
    vswitch_ids = ["${alicloud_vswitch.vsw.id}"]
    security_group_id  = "${alicloud_security_group.SecGroup_FC.id}"
    }

    ]


}
//Function
resource "alicloud_fc_function" "fortigate-autoscale" {
  service = "${alicloud_fc_service.fortigate-autoscale-service.name}"
  name = "${var.cluster_name}-${random_string.random_name_post.result}"
  description = "FortiGate AutoScale - AliCloud Created by Terraform"
  filename = "./FortiGateAutoScaleFunctionCode.zip"
  memory_size = "512"
  runtime = "nodejs8"
  handler = "index.handler",
  timeout = "500",
  environment_variables {
    managedby = "Created with Terraform"
    FORTIGATE_PSKSECRET = "${random_string.psk.result}"
    REGION_ID = "${var.region}"
    ENDPOINT_ESS = "https://ess.aliyuncs.com"
    ENDPOINT_ECS = "https://ecs.${var.region}.aliyuncs.com"
    ACCESS_KEY_SECRET = "${var.secret_key}"
    ACCESS_KEY_ID = "${var.access_key}"
    OSS_ENDPOINT = "oss-${var.region}.aliyuncs.com"
    BUCKET_NAME =  "${alicloud_oss_bucket.FortiGateAutoScaleConfig.bucket}"
    REGION_ID_OSS = "oss-${var.region}"
    CLIENT_TIMEOUT = 3000 //default
    DEFAULT_HEART_BEAT_INTERVAL = 10
    HEART_BEAT_DELAY_ALLOWANCE = 25000
    SCRIPT_EXECUTION_EXPIRE_TIME = 350000
    SCRIPT_TIMEOUT = 500
    TABLE_STORE_END_POINT ="https://${alicloud_ots_instance.tablestore.name}.${var.region}.ots.aliyuncs.com"
    TABLE_STORE_INSTANCENAME ="${alicloud_ots_instance.tablestore.name}"
    AUTO_SCALING_GROUP_NAME="${alicloud_ess_scaling_group.scalinggroups_ds.scaling_group_name}"

    BASE_CONFIG_NAME="cloud-init.sh"

  }
}
//Function Compute Trigger
resource "alicloud_fc_trigger" "httptrigger" {
  service = "${alicloud_fc_service.fortigate-autoscale-service.name}"
  function = "${alicloud_fc_function.fortigate-autoscale.name}"
  name = "HTTPTrigger"


  type = "http"
  config = <<EOF
    {
        "methods": ["GET","POST"],
        "authType": "anonymous",
        "sourceConfig": {
            "project": "project-for-fc",
            "logstore": "project-for-fc"
        },
        "jobConfig": {
            "maxRetryTime": 3,
            "triggerInterval": 200
        },
        "functionParameter": {
            "a": "b",
            "c": "d"
        },
        "logConfig": {
            "project": "${alicloud_log_project.AutoScaleLogging.name}",
            "logstore": "${alicloud_log_store.AutoScaleLogging-Store.name}"
        },
        "enable": true
    }
  EOF

}


resource "alicloud_log_project" "AutoScaleLogging" {
  name        = "fortigateautoscalelog-${random_string.random_name_post.result}" //Name must be lower case
  description = "created by terraform"
}

resource "alicloud_log_store" "AutoScaleLogging-Store" {
  project               = "${alicloud_log_project.AutoScaleLogging.name}"
  name                  = "autoscalelog-store-${random_string.random_name_post.result}"
  shard_count           = 3
  auto_split            = true
  max_split_shard_count = 60
  append_meta           = true
  retention_period = 15
}
resource "alicloud_log_store_index" "log_store_index" {
  project = "${alicloud_log_project.AutoScaleLogging.name}"
  logstore = "${alicloud_log_store.AutoScaleLogging-Store.name}"
  full_text {
    case_sensitive = true
    token = " #$%^*\r\n\t"
  }
  field_search = [
    {
      name = "${alicloud_fc_function.fortigate-autoscale.name}"
      enable_analytics = true
    }
  ]
}
output "triggerUrl"{
    value = "${alicloud_ess_scaling_configuration.config.user_data}"

}
output config{
  value = "${local_file.LocalConfigWrite.content}"
}


output "PSK Secret"{
  value = "${random_string.psk.result}"
}
