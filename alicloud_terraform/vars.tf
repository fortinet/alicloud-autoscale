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

//CPU threshold to scale in or out 
variable "scale_in_threshold"{
    type = "string"
    default = 35
}
variable "scale_out_threshold"{
    type = "string"
    default = 70
}
//Retrieves the current account for use with Function Compute
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
