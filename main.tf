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
//Get Instance types with min requirements in teh region. 
data "alicloud_instance_types" "types_ds" {
  cpu_core_count = 2
  memory_size = 8
  instance_type_family = "ecs.g5"
}
//SLB
data "alicloud_regions" "current_region_ds" {
  current = true
}
data "alicloud_zones" "default" {}
//Create a Random String to be used for the PSK secret.
resource "random_string" "psk" {
  length = 16
  special = true
  override_special = "/@\" "
}
resource "alicloud_ram_role" "ram_role" {
  name = "fortigateautoscaleLogging"
  services = ["apigateway.aliyuncs.com"]
  description = "this is a role test."
  force = true
}

resource "alicloud_ram_policy" "policy" {
  name = "policyName"
  depends_on = ["alicloud_ram_role.ram_role","alicloud_log_project.AutoScaleLogging", "alicloud_log_store.AutoScaleLogging-Store"]
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

resource "alicloud_vpc" "vpc" {
  cidr_block = "172.16.0.0/16"
  name = "${var.cluster_name}"
}


resource "alicloud_vswitch" "vsw" {
  vpc_id            = "${alicloud_vpc.vpc.id}"
  cidr_block        = "172.16.0.0/21"
  availability_zone = "${data.alicloud_zones.default.zones.0.id}"
}


resource "alicloud_slb" "default" {
  name                 = "${var.cluster_name}.SLB"
  internet             = true
  internet_charge_type = "PayByTraffic"
  bandwidth            = 5
  specification = "slb.s1.small"
  master_zone_id       = "${data.alicloud_zones.default.zones.0.id}"//first available zone 
  slave_zone_id        = "${data.alicloud_zones.default.zones.1.id}"//second available zone.
}
resource "alicloud_slb_acl" "acl" {
  name = "autoscaleSLB_ACL"
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
  backend_port = 80
  frontend_port = 80
  health_check = "on"
  health_check_connect_port = 80
  bandwidth = 10
  protocol = "http"
  sticky_session = "on" //Persistent session
  sticky_session_type = "insert"
  cookie = "FortiGateAutoScaleSLB"
  cookie_timeout = 86400
  acl_status                = "off"
  acl_type                  = "white"
  acl_id                    = "${alicloud_slb_acl.acl.id}"
}

//Security Group
resource "alicloud_security_group" "SecGroup" {
  name        = "FortigateAutoscale_SecGroup"
  description = "New security group"
  vpc_id = "${alicloud_vpc.vpc.id}"
}
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
data "alicloud_images" "ecs_image" {
  owners = "marketplace"
  most_recent = true
  name_regex  = "^Fortinet FortiGate"// Grab the latest Image from marketplace. 
}

resource "alicloud_ess_scaling_group" "scalinggroups_ds" {
    
  // Autoscaling Group
  depends_on = ["alicloud_slb_listener.http"]
  scaling_group_name = "FortigateAutoScale"
  min_size           = 2
  max_size           = 3
  removal_policies   = ["OldestInstance", "NewestInstance"]
  vswitch_ids = ["${alicloud_vswitch.vsw.id}"]


  loadbalancer_ids = [
    "${alicloud_slb.default.id}",
  ]
}
//Scaling Config

resource "alicloud_ess_scaling_configuration" "config" {
  
  force_delete = true
  scaling_group_id  = "${alicloud_ess_scaling_group.scalinggroups_ds.id}"
  image_id          = "${data.alicloud_images.ecs_image.images.0.id}" //grab the first image that matches the regex
  instance_type     = "${data.alicloud_instance_types.types_ds.instance_types.0.id}"//Grab the first instance that meets the requirements. Default 2 Cpu 8GB memory. //ecs.g5.xlarge" 
  security_group_id = "${alicloud_security_group.SecGroup.id}"
  internet_charge_type = "PayByTraffic"
  active = true
  enable = true
  user_data = "{'config-url':'https://${data.alicloud_account.current.id}.${var.region}-internal.fc.aliyuncs.com/2016-08-15/proxy/${alicloud_fc_service.fortigate-autoscale-service.name}/${alicloud_fc_function.fortigate-autoscale.name}/'}"
  depends_on = ["alicloud_fc_service.fortigate-autoscale-service","alicloud_fc_function.fortigate-autoscale","alicloud_fc_trigger.httptrigger","alicloud_oss_bucket_object.object-content","alicloud_ots_instance.tablestore"]
  
}





# Create an OTS instance
resource "alicloud_ots_instance" "tablestore" {
  name = "FortiGateASG2" //16 char limit
  description = "TableStore Instance Terraform"
  accessed_by = "Any"
  tags {
    Created = "TF"
    For = "FortiGate AutoScale Table"
  }
}
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
   set callback-url https://${data.alicloud_account.current.id}.${var.region}.fc.aliyuncs.com/2016-08-15/proxy/${alicloud_fc_service.fortigate-autoscale-service.name}/${alicloud_fc_function.fortigate-autoscale.name}/
   set psksecret {PSK_SECRET}

end

    EOF
    filename = "./cloud-init.sh"
}
resource "alicloud_oss_bucket" "FortiGateAutoScaleConfig" {
  bucket = "fortigateautoscaleconfig" //Must be in lower case.
  acl = "public-read"
}

resource "alicloud_oss_bucket_object" "object-content" {
  bucket = "${alicloud_oss_bucket.FortiGateAutoScaleConfig.bucket}"
  key    = "cloud-init.sh"
  source = "./cloud-init.sh"
  depends_on = ["local_file.LocalConfigWrite"]
}

//Create the Function Service
resource "alicloud_fc_service" "fortigate-autoscale-service" {
    name = "fortigate-autoscale-service"
    description = "Created by terraform"
    internet_access = true
    role = "${alicloud_ram_role.ram_role.arn}"
    log_config = [
    {project = "${alicloud_log_project.AutoScaleLogging.name}"
    logstore = "${alicloud_log_store.AutoScaleLogging-Store.name}"
    }
    
    ]

}
//Function
resource "alicloud_fc_function" "fortigate-autoscale" {
  service = "${alicloud_fc_service.fortigate-autoscale-service.name}"
  name = "fortigate-autoscale"
  description = "FortiGate AutoScale - AliCloud Created by Terraform"
  filename = "./AutoScaleAliCloudTerraformBuild.zip"
  memory_size = "512"
  runtime = "nodejs8"
  handler = "index.handler",
  timeout = "200",
  environment_variables {
    managedby = "Created with Terraform"
    FORTIGATE_PSKSECRET = "${random_string.psk.result}"
    REGION_ID = "${var.region}"
    ENDPOINT_ESS = "https://ess.aliyuncs.com"
    ENDPOINT_ECS = "https://ecs.aliyuncs.com"
    ACCESS_KEY_SECRET = "${var.secret_key}"
    ACCESS_KEY_ID = "${var.access_key}"
    OSS_ENDPOINT = "oss-${var.region}.aliyuncs.com"
    BUCKET_NAME =  "${alicloud_oss_bucket.FortiGateAutoScaleConfig.bucket}"
    REGION_ID_OSS = "oss-${var.region}"
    CLIENT_TIMEOUT = 3000 //default
    DEFAULT_HEART_BEAT_INTERVAL = 10000
    HEART_BEAT_DELAY_ALLOWANCE = 3000
    SCRIPT_EXECUTION_EXPIRE_TIME = "180000 + Date.now()"
    SCRIPT_EXECUTION_TIME_CHECKPOINT = 3000
    SCRIPT_TIMEOUT = 200
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
  name        = "fortigateautoscalelog" //Name must be lower case
  description = "created by terraform"
}

resource "alicloud_log_store" "AutoScaleLogging-Store" {
  project               = "${alicloud_log_project.AutoScaleLogging.name}"
  name                  = "autoscalelog-store"
  shard_count           = 3
  auto_split            = true
  max_split_shard_count = 60
  append_meta           = true
  retention_period = 15
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



