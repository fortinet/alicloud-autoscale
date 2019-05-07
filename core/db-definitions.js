'use strict';

/*
FortiGate Autoscale AWS DynamoDB table definitions (1.0.0-beta)
Author: Fortinet
*/
exports = module.exports;
const DB = {
    LIFECYCLEITEM: {
        tableMeta: {
            tableName: 'FortiGateLifecycleItem',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                },
                {
                    name: 'actionName',
                    type: 'STRING'
                }
            ]},
        reservedThroughput: {
            capacityUnit: {
                read: 0,
                write: 0
            }
        },

        attributeColumns: [],
        tableOptions: {
            timeToLive: -1,
            maxVersions: 1
        },
        streamSpecification: {
            enableStream: true,
            expirationTime: 24
        }
    },
    AUTOSCALE: {
        tableMeta: {
            tableName: 'FortiGateAutoscale',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                }
            ]},
        attributeColumns: [
            {
                name: 'asgName',
                type: 'STRING'
            },
            {
                name: 'heartBeatLossCount',
                type: 'INTEGER'
            },
            {
                name: 'heartBeatInterval',
                type: 'INTEGER'
            },
            {
                name: 'nextHeartBeatTime',
                type: 'INTEGER'
            },
            {
                name: 'masterIp',
                type: 'STRING'
            },
            {
                name: 'syncState',
                type: 'STRING'
            }
        ],
        reservedThroughput: {
            capacityUnit: {
                read: 0,
                write: 0
            }
        },
        tableOptions: {
            timeToLive: -1,
            maxVersions: 1
        },
        streamSpecification: {
            enableStream: true,
            expirationTime: 24
        }
    },
    ELECTION: {
        tableMeta: {
            tableName: 'FortiGateMasterElection',
            primaryKey: [
                {
                    name: 'asgName',
                    type: 'STRING'
                }
            ]},
        attributeColumns: [
            {
                name: 'instanceId',
                type: 'STRING'
            },
            {
                name: 'asgName',
                type: 'STRING'
            },
            {
                name: 'ip',
                type: 'STRING'
            },
            {
                name: 'vpcId',
                type: 'STRING'
            },
            {
                name: 'subnetId',
                type: 'STRING'
            },
            {
                name: 'voteEndTime',
                type: 'INTEGER'
            },
            {
                name: 'voteState',
                type: 'STRING'
            }
        ],
        reservedThroughput: {
            capacityUnit: {
                read: 0,
                write: 0
            }
        },
        tableOptions: {
            timeToLive: -1,
            maxVersions: 1
        },
        streamSpecification: {
            enableStream: true,
            expirationTime: 24
        }
    },
    FORTIANALYZER: {
        tableMeta: {
            tableName: 'FortiAnalyzer',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                }
            ]},
        attributeColumns: [
            {
                name: 'serialNumber',
                type: 'STRING'
            },
            {
                name: 'ip',
                type: 'STRING'
            },
            {
                name: 'vip',
                type: 'STRING'
            },
            {
                name: 'master',
                type: 'BOOLEAN'
            },
            {
                name: 'peers',
                type: 'STRING'
            }
        ],
        reservedThroughput: {
            capacityUnit: {
                read: 0,
                write: 0
            }
        },
        tableOptions: {
            timeToLive: -1,
            maxVersions: 1
        },
        streamSpecification: {
            enableStream: true,
            expirationTime: 24
        }
    },
    SETTINGS: {
        tableMeta: {
            tableName: 'Settings',
            primaryKey: [
                {
                    name: 'settingKey',
                    type: 'STRING'
                }
            ]},
        attributeColumns: [
            {
                name: 'settingValue',
                type: 'STRING'
            }
        ],
        reservedThroughput: {
            capacityUnit: {
                read: 0,
                write: 0
            }
        },
        tableOptions: {
            timeToLive: -1,
            maxVersions: 1
        },
        streamSpecification: {
            enableStream: true,
            expirationTime: 24
        }

    },
    NICATTACHMENT: {
        tableMeta: {
            tableName: 'FortiGateLifecycleItem',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                },
                {
                    name: 'actionName',
                    type: 'STRING'
                }
            ]},
        AttributeDefinitions: [
            {
                name: 'instanceId',
                type: 'STRING'
            }
        ],
        KeySchema: [
            {
                name: 'instanceId',
                KeyType: 'HASH'
            }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'NicAttachment',
        AdditionalAttributeDefinitions: [
            {
                name: 'nicId',
                type: 'STRING'
            },
            {
                name: 'attachmentState',
                type: 'STRING'
            }
        ]
    },
    VMINFOCACHE: {
        tableMeta: {
            tableName: 'FortiGateLifecycleItem',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                },
                {
                    name: 'actionName',
                    type: 'STRING'
                }
            ]},
        AttributeDefinitions: [
            {
                name: 'instanceId',
                type: 'STRING'
            }
        ],
        KeySchema: [
            {
                name: 'instanceId',
                KeyType: 'HASH'
            }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'VmInfoCache',
        AdditionalAttributeDefinitions: [
            {
                name: 'vmId',
                type: 'STRING'
            },
            {
                name: 'asgName',
                type: 'STRING'
            },
            {
                name: 'info',
                type: 'STRING'
            }
        ]
    },
    LICENSESTOCK: {
        tableMeta: {
            tableName: 'FortiGateLifecycleItem',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                },
                {
                    name: 'actionName',
                    type: 'STRING'
                }
            ]},
        AttributeDefinitions: [
            {
                name: 'checksum',
                type: 'STRING'
            }
        ],
        KeySchema: [
            {
                name: 'checksum',
                KeyType: 'HASH'
            }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'LicenseStock',
        AdditionalAttributeDefinitions: [
            {
                name: 'fileName',
                type: 'STRING'
            },
            {
                name: 'algorithm',
                type: 'STRING'
            }
        ]
    },
    LICENSEUSAGE: {
        tableMeta: {
            tableName: 'FortiGateLifecycleItem',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                },
                {
                    name: 'actionName',
                    type: 'STRING'
                }
            ]},
        AttributeDefinitions: [
            {
                name: 'id',
                type: 'STRING'
            }
        ],
        KeySchema: [
            {
                name: 'id',
                KeyType: 'HASH'
            }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'LicenseUsage',
        AdditionalAttributeDefinitions: [
            {
                name: 'id',
                type: 'STRING'
            },
            {
                name: 'sha1-checksum',
                type: 'STRING'
            },
            {
                name: 'fileName',
                type: 'STRING'
            },
            {
                name: 'algorithm',
                type: 'STRING'
            },
            {
                name: 'asgName',
                type: 'STRING'
            },
            {
                name: 'instanceId',
                type: 'STRING'
            },
            {
                name: 'assignedTime',
                type: 'INTEGER'
            }
        ]
    },
    CUSTOMLOG: {
        tableMeta: {
            tableName: 'FortiGateLifecycleItem',
            primaryKey: [
                {
                    name: 'instanceId',
                    type: 'STRING'
                },
                {
                    name: 'actionName',
                    type: 'STRING'
                }
            ]},
        AttributeDefinitions: [
            {
                name: 'id',
                type: 'STRING'
            },{
                name: 'timestamp',
                type: 'INTEGER'
            }
        ],
        KeySchema: [
            {
                name: 'id',
                KeyType: 'HASH'
            },{
                name: 'timestamp',
                KeyType: 'RANGE'
            }
        ],
        ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
        TableName: 'CustomLog',
        AdditionalAttributeDefinitions: [
            {
                name: 'logContent',
                type: 'STRING'
            }
        ]
    }

};


exports.getTables = (custom_id, unique_id) => {
    let tables = {},
        prefix = () => { return custom_id ? `${custom_id}-` : '' },
        suffix = () => { return unique_id ? `-${unique_id}` : '' };
    Object.keys(DB).forEach(itemName => {
        let table = {};
        table.tableMeta = DB[itemName].tableMeta;
        // table.tableMeta.primaryKey = DB[itemName].tableMeta.primaryKey;
        // table.tableMeta.tableName = prefix() + DB[itemName].tableMeta.tableName + suffix();
        table.reservedThroughput = DB[itemName].reservedThroughput;
        table.attributeColumns = DB[itemName].attributeColumns;// tableMeta
        table.tableOptions = DB[itemName].tableOptions;
        table.streamSpecification = DB[itemName].streamSpecification;
        tables[itemName] = table;
    });
    return tables;
};

exports.getTableSchema = (tables, tableName) => {
    if (!tables || !tables.hasOwnProperty(tableName)) {
        return null;
    }
    let schema = {};
    schema.AttributeDefinitions = tables[tableName].AttributeDefinitions;
    schema.KeySchema = tables[tableName].KeySchema;
    schema.TableName = tables[tableName].TableName;
    schema.ProvisionedThroughput = tables[tableName].ProvisionedThroughput;
    return schema;
};
