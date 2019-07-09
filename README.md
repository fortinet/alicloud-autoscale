# FortiGate Autoscale
A collection of **Node.js** modules and cloud-specific templates which support autoscale functionality for groups of FortiGate-VM instances on various cloud platforms.

This project contains the code and templates for the **AliCloud Autoscale** deployment.
For autoscale on other cloud providers see the [fortigate-autoscale](https://github.com/fortinet/fortigate-autoscale/) repository.

## Supported Platforms
This project supports autoscale for the cloud platforms listed below. The version tag in parentheses refers to the autoscale module version included in this project.

  * AliCloud (1.0.0)


## Deployment Packages
To generate local deployment packages:

  1. Clone this project.
  2. Run `npm run build` at the project root directory.

Terraform deployment scripts will be located under [alicloud_terraform](/alicloud_terraform). Source code will be available in the **dist** directory.

| File Name | Description |
| ------ | ------ |
| alicloud-autoscale.zip | Source code for the AliCloud Auto Scaling handler - AliCloud Function Compute|
| main.tf |  Terraform configuration file for AliCloud deployment |
| vars.tf |  Terraform configuration file for AliCloud deployment |

An Installation Guide is available from the Fortinet Document Library:

  * [ FortiGate / FortiOS Deploying Auto Scaling on AliCloud](https://docs.fortinet.com/vm/alicloud/fortigate/6.2/alicloud-cookbook/6.2.0/337811/deploying-auto-scaling-on-alicloud)


# Support
Fortinet-provided scripts in this and other GitHub projects do not fall under the regular Fortinet technical support scope and are not supported by FortiCare Support Services.
For direct issues, please refer to the [Issues](https://github.com/fortinet/alicloud-autoscale/issues) tab of this GitHub project.
For other questions related to this project, contact [github@fortinet.com](mailto:github@fortinet.com).

## License
[License](https://github.com/fortinet/alicloud-autoscale/blob/master/LICENSE) © Fortinet Technologies. All rights reserved.
