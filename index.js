'use strict';
/*
FortiGate Autoscale AliCloud Module
Author: Fortinet
*/

exports = module.exports;

const Core = require('@alicloud/pop-core');
const CoreFunctions = require('./core/core-functions');
const AutoscaleHandler = require('./core/autoscale-handler');
const CloudPlatform = require('./core/cloud-platform');
const tableStoreClient = require('tablestore');
const oss = require('ali-oss');
const getRawBody = require('raw-body');
const dbDefinitions = require('./core/db-definitions');
const DB = dbDefinitions.getTables('', '');
const AutoScaleCore = require('./core/core-functions');

const
    REGION_ID = process.env.REGION_ID,
    ENDPOINT_ESS = process.env.ENDPOINT_ESS,
    ENDPOINT_ECS = process.env.ENDPOINT_ECS,
    ACCESS_KEY_SECRET = process.env.ACCESS_KEY_SECRET,
    ACCESS_KEY_ID = process.env.ACCESS_KEY_ID,
    CLIENT_TIMEOUT = 3000, // Determines the API timeout, not script timeout. Set to default
    DEFAULT_HEART_BEAT_INTERVAL = process.env.DEFAULT_HEART_BEAT_INTERVAL,
    HEART_BEAT_DELAY_ALLOWANCE = process.env.HEART_BEAT_DELAY_ALLOWANCE,
    SCRIPT_EXECUTION_EXPIRE_TIME = process.env.SCRIPT_EXECUTION_EXPIRE_TIME + Date.now(),
    SCRIPT_TIMEOUT = process.env.SCRIPT_TIMEOUT ? process.env.SCRIPT_TIMEOUT : 100,
    TABLE_STORE_END_POINT = process.env.TABLE_STORE_END_POINT,
    TABLE_STORE_INSTANCENAME = process.env.TABLE_STORE_INSTANCENAME,
    SCRIPT_EXECUTION_TIME_CHECKPOINT = Date.now(),
    settingItems = AutoScaleCore.settingItems;

let logger = new AutoScaleCore.DefaultLogger(console);

var client = new Core({
    accessKeyId: ACCESS_KEY_ID,
    accessKeySecret: ACCESS_KEY_SECRET,
    endpoint: ENDPOINT_ESS,
    apiVersion: '2014-08-28', // https://github.com/aliyun/openapi-core-nodejs-sdk,
    opts: {
        timeout: CLIENT_TIMEOUT
    }
});


var ecsClient = new Core({
    accessKeyId: ACCESS_KEY_ID,
    accessKeySecret: ACCESS_KEY_SECRET,
    endpoint: ENDPOINT_ECS,
    apiVersion: '2014-05-26', // https://github.com/aliyun/openapi-core-nodejs-sdk,
    opts: {
        timeout: CLIENT_TIMEOUT
    }
});

var tablestoreClient = new tableStoreClient.Client({
    accessKeyId: ACCESS_KEY_ID,
    accessKeySecret: ACCESS_KEY_SECRET,
    endpoint: TABLE_STORE_END_POINT,
    instancename: TABLE_STORE_INSTANCENAME,
    apiVersion: '2014-08-28', // https://github.com/aliyun/openapi-core-nodejs-sdk
    opts: {
        timeout: CLIENT_TIMEOUT
    }
});


class AliCloud extends CloudPlatform {
    async init() {
        var db = await this.getTables();
        var tableArray = [db.AUTOSCALE, db.ELECTION, db.LIFECYCLEITEM,db.FORTIANALYZER,
            db.SETTINGS];
        for (let table of tableArray) {
            if (!await this.tableExists(table.tableMeta.tableName)) {
                await this.createTable(table);
            }
        }
    }

    //* *Instance Handling -- Where we get the instances and state for an election */
    async getAllAutoScaleInstanceIds(params2) {
        var requestOption = {
            method: 'POST'
        };
        var listOfScalingInstances = [];
        try {
            var result = await client.request('DescribeScalingInstances', params2, requestOption);
        } catch (err) {
            console.log(`error fetching IP's in AutoScale Group ${err}`);
        }
        if (result.ScalingInstances && result.ScalingInstances.ScalingInstance) {
            for (let instance of result.ScalingInstances.ScalingInstance) {
                if (instance.InstanceId) {
                    listOfScalingInstances.push(instance.InstanceId);
                }
            }
            return listOfScalingInstances;
        } else {
            console.log('JSON parse was not successful');
        }
    }


    async updateInstanceHealthCheck(healthCheckObject, heartBeatInterval, masterIp, checkPointTime,
    forceOutOfSync = false) {
        try {
            var params = {
                tableName: DB.AUTOSCALE.tableMeta.tableName,
                condition: new tableStoreClient.Condition(
                  tableStoreClient.RowExistenceExpectation.IGNORE, null),
                primaryKey: [{
                    instanceId: healthCheckObject.instanceId
                }],

                attributeColumns: [{
                    HeartBeatLossCount: healthCheckObject.heartBeatLossCount
                },
                {
                    MasterIp: masterIp ? masterIp : 'null'
                },
                {
                    NextHeartBeatTime: checkPointTime + heartBeatInterval * 1000

                },

                {
                    SyncState: healthCheckObject.healthy &&
                     !forceOutOfSync ? 'in-sync' : 'out-of-sync'
                },
                {
                    autoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME
                },
                {
                    heartBeatInterval: heartBeatInterval
                }

                ],
                returnContent: {
                    returnType: tableStoreClient.ReturnType.Primarykey
                }
            };
            await tablestoreClient.putRow(params, function(err) {
                if (err) {
                    console.log('error:', err, 'Data', params);

                    return;
                }

                console.log('success:', params);
            });

        } catch (err) {
            console.log('Error updating Instance Health Check', err);
        }
    }

    async deleteInstanceHealthCheck(instanceId) {
    // only purge the master with a done votestate to avoid a
    // race condition
        console.log('Removing Instance from Health Check (AUTOSCALE table)', instanceId);
        const params = {
            tableName: DB.AUTOSCALE.tableMeta.tableName,
            condition: new tableStoreClient.Condition(
              tableStoreClient.RowExistenceExpectation.IGNORE, null),
            primaryKey: [{
                instanceId: instanceId
            }]
        };
        try {
            var data = await tablestoreClient.deleteRow(params);
            return !!data;
        } catch (err) {
            console.log('Error in removing Master Record ', err);
            return false;
        }

    }

    // return data && data.Body && data.Body.toString('ascii');
    async getBlobFromStorage(fileName) {
        var ossClient = new oss({
            accessKeyId: ACCESS_KEY_ID,
            accessKeySecret: ACCESS_KEY_SECRET,
            bucket: process.env.BUCKET_NAME,
            region: process.env.REGION_ID_OSS
        });

        try {
            var result = await ossClient.get(fileName); // "cloud-init.sh"
            var resultBufferConvert = Buffer.from(result.content);
            var resultBufferToString = resultBufferConvert.toString();
        } catch (ex) {
            console.log(ex);
        }

        return {
            content: resultBufferToString
        };
    }
    async createTable(table) {
        await tablestoreClient.createTable(table, function(err, data) {
            if (err) {
                console.log('error:', err);
                return;
            }
            console.log('success:', data);
        });
        return;
    }

    async getTables() {
        var dbCollection = dbDefinitions;
        return await dbCollection.getTables('', '');

    }
    /** @override */
    async getMasterRecord() {
        console.log('Getting Master Record.');

        const params = {
            tableName: DB.ELECTION.tableMeta.tableName,
            primaryKey: [{
                asgName: 'Master'
            }]
        };
        var data = await tablestoreClient.getRow(params);

        if (!data || !data.row || !data.row.attributes) {
            console.log(`No Master Found in database ${DB.ELECTION.tableMeta.tableName}`);
            return null;
        }
        // AliCloud returns an array of values with Columnname == attribute.
        var masterDataDigest = {
            instanceId: data.row.attributes[0].columnValue,
            ip: data.row.attributes[1].columnValue,
            subnetId: data.row.attributes[2].columnValue,
            voteEndTime: data.row.attributes[3].columnValue,
            voteState: data.row.attributes[4].columnValue,
            vpcId: data.row.attributes[5].columnValue,
            primaryPrivateIpAddress: data.row.attributes[1].columnValue
        };

        return masterDataDigest;

    }
    async terminateInstanceInAutoScalingGroup(instance) {
        var InstanceParams = {
            RegionId: REGION_ID,
            InstanceId: instance.instanceId
        };
        var requestOption = {
            method: 'POST'
        };
        try {
            await ecsClient.request('StopInstance', InstanceParams, requestOption);
            var terminateInstance = await ecsClient.request(
              'DeleteInstance', InstanceParams, requestOption);
            console.log('Terminating Instance', JSON.stringify(terminateInstance));
            return true;
        } catch (err) {
            console.log(`error in API request to terminate Instance${err}`);
            return false;
        }
    }

    async putMasterRecord(candidateInstance, voteState) {

        console.log('Updating Master Record Database', candidateInstance);
        var dateToInt = Date.now();

        var params = {
            tableName: DB.ELECTION.tableMeta.tableName,
            condition: new tableStoreClient.Condition(
              tableStoreClient.RowExistenceExpectation.IGNORE, null),
            primaryKey: [{
                asgName: 'Master'
            }],
            attributeColumns: [{
                ip: candidateInstance.primaryPrivateIp
            },
            {
                instanceId: candidateInstance.instanceId
            },
            {
                vpcId: 'candidateInstance.virtualNetworkId'
            },
            {
                subnetId: 'candidateInstance.subnetId'
            },
            {
                voteEndTime: dateToInt + (SCRIPT_TIMEOUT - 1) * 1000
            },
            {
                voteState: voteState
            }
            ]
        };
        return await tablestoreClient.putRow(params, function(err, data) {
            if (err) {
                console.log('error:', err);
                return;
            }

            console.log('success:', data);
        });

    }
    async finalizeMasterElection() {
        console.log('Finalizing Master election');
        var voteState = 'done';
        var params = {
            tableName: DB.ELECTION.tableMeta.tableName,
            condition: new tableStoreClient.Condition(
              tableStoreClient.RowExistenceExpectation.IGNORE, null),
            primaryKey: [{
                asgName: 'Master'
            }],
            updateOfAttributeColumns: [{
                PUT: [{
                    voteState: voteState
                }]
            }]
        };
        return await tablestoreClient.updateRow(params, function(err) {
            if (err) {
                console.log('error:', err);
                return false;
            }
        });
    }
    async tableExists(tableName) {
        var tableList = await this.getTablesInTableStoreInstance();
        for (let table of tableList.table_names) {
            if (table === tableName) {
                return true;
            }
        }
        return false;


    }

    async getTablesInTableStoreInstance() {
        var tableList = await tablestoreClient.listTable({});
        return tableList;

    }
    extractRequestInfo(request, instanceObject) {
        let instanceId = null,
            interval = DEFAULT_HEART_BEAT_INTERVAL;
        // fos-instance-id appears to be lower case in alicloud...
        if (request && request.headers && request.headers['fos-instance-id']) {
            instanceId = request.headers['fos-instance-id'];
        } else if (request) {
            try {
                let jsonBodyObject = instanceObject;
                instanceId = jsonBodyObject.instance;
                if (jsonBodyObject.interval) {
                    interval = jsonBodyObject.interval;
                }
            } catch (ex) {
                logger.info('calling extractRequestInfo: unexpected body content format ', ex);
            }
        } else {
            logger.error('calling extractRequestInfo: no request body found.');
        }
        console.log('Extracted instanceID:', instanceId);
        return {
            instanceId,
            interval,
            status: 'success'
        };
    }

    /** @override */
    async describeInstance(instanceObject) {
        var InstanceParams = {
            RegionId: REGION_ID,
            // Escapes required for alicloud.
            // eslint-disable-next-line no-useless-escape
            InstanceIds: `[\"${instanceObject.instanceId}\"]`
        };
        var requestOption = {
            method: 'POST'
        };
        try {
            var result = await ecsClient.request(
              'DescribeInstances', InstanceParams, requestOption);
        } catch (err) {
            console.log(`error in API request to describe Instances ${err}`);
        }
        console.log(result);
        if (result.Instances.Instance.length > 0 &&
           result.Instances.Instance[0].NetworkInterfaces &&
           result.Instances.Instance[0].NetworkInterfaces.NetworkInterface[0].PrimaryIpAddress) {
            result.instanceId = result.Instances.Instance[0].InstanceId;
            var resultDigest = {
                instanceId: result.Instances.Instance[0].InstanceId,
                primaryPrivateIp: result.Instances.Instance[0].NetworkInterfaces.
                NetworkInterface[0].PrimaryIpAddress,
                primaryPrivateIpAddress: result.Instances.Instance[0].NetworkInterfaces.
                NetworkInterface[0].PrimaryIpAddress
            };
            return resultDigest;
        } else {
            console.log('No Instance, Returning Null');
            return null;
        }
    }
    getCallbackEndpointUrl(fromContext) {
        return (`${fromContext.accountId}.${fromContext.region}.${REGION_ID}.fc.aliyuncs.com
          /2016-08-15/proxy/${fromContext.service.name}/${fromContext.function.name}/`);
    }

    async getInstanceHealthCheck(instance, heartBeatInterval = null) {

        if (!(instance && instance.instanceId)) {
            logger.error('getInstanceHealthCheck > error: no instanceId property found' +
                ` on instance: ${JSON.stringify(instance)}`);
            return Promise.reject(`invalid instance: ${JSON.stringify(instance)}`);
        }
        const params = {
            tableName: DB.AUTOSCALE.tableMeta.tableName,
            primaryKey: [{
                instanceId: instance.instanceId
            }]
        };
        try {
            let compensatedScriptTime,
                healthy,
                heartBeatLossCount,
                interval,
                data = await tablestoreClient.getRow(params);
            // row will always return true, must check if at least one instance within is valid.
            if (data.row && data.row.attributes && data.row.attributes[0]) {
                compensatedScriptTime = SCRIPT_EXECUTION_TIME_CHECKPOINT;
                interval = heartBeatInterval && !isNaN(heartBeatInterval) ?
                    heartBeatInterval : data.row.attributes[5].columnValue;
                // based on the test results, network delay brought more significant side effects
                // to the heart beat monitoring checking than we thought. we have to expand the
                // checking time to reasonably offset the delay.
                // HEART_BEAT_DELAY_ALLOWANCE is used for this purpose
                // NextHeartBeat
                if (compensatedScriptTime <
                    data.row.attributes[2].columnValue + HEART_BEAT_DELAY_ALLOWANCE) {
                    // reset hb loss count if instance sends hb within its interval
                    healthy = true;
                    heartBeatLossCount = 0;
                } else {
                    // if the current sync heartbeat is late, the instance is still considered
                    // healthy unless 3 times of heartBeatInterval amount of time has passed.
                    // in other words, the instance totally lost the time of 3 hb syncing
                    // network delay allowance also applies to the case here.
                    // heartBeatLossCount
                    healthy = data.row.attributes[0].columnValue < 3 &&
                    // nextHeartBeat
                    Date.now() < data.row.attributes[2].columnValue + HEART_BEAT_DELAY_ALLOWANCE +
                    interval * 1000 * (2 - data.row.attributes[0].columnValue);
                    heartBeatLossCount = data.row.attributes[0].columnValue + 1;
                }
                logger.info('called getInstanceHealthCheck');
                return {
                    instanceId: instance.instanceId,
                    healthy: healthy,
                    heartBeatLossCount: heartBeatLossCount,
                    heartBeatInterval: interval,
                    nextHeartBeatTime: Date.now() + interval * 1000,
                    masterIp: data.row.attributes[1].columnValue,
                    syncState: data.row.attributes[3].columnValue,
                    inSync: data.row.attributes[3].columnValue === 'in-sync'
                };
            } else {
                logger.info('called getInstanceHealthCheck: no record for ',
                instance.instanceId,' found');
                return null;
            }
        } catch (error) {
            logger.info(`called getInstanceHealthCheck with error. ${error}`);
            return null;
        }
    }

    async removeMasterRecord() {
    // only purge the master with a done votestate to avoid a
    // race condition
        console.log('Removing master Record');
        const params = {
            tableName: DB.ELECTION.tableMeta.tableName,
            condition: new tableStoreClient.Condition(tableStoreClient.
              RowExistenceExpectation.IGNORE, null),
            primaryKey: [{
                asgName: 'Master'
            }]
        };
        try {
            return await tablestoreClient.deleteRow(params);
        } catch (err) {
            console.log('Error in removing Master Record ', err);
        }
    }
    async setSettingItem(key, jsonValue) {
        try {
            var params = {
                tableName: DB.SETTINGS.tableMeta.tableName,
                condition: new tableStoreClient.Condition(
                  tableStoreClient.RowExistenceExpectation.IGNORE, null),
                primaryKey: [{
                    settingKey: key
                }],
                attributeColumns: [{
                    settingValue: jsonValue
                }],
                returnContent: {
                    returnType: tableStoreClient.ReturnType.Primarykey
                }
            };
            await tablestoreClient.putRow(params, function(err, data) {
                if (err) {
                    console.log('error:', err);
                    return;
                }
                return data;
            });
        } catch (err) {
            console.log('Error updating Setting Table', err);
        }
    }
}

class AliCloudAutoscaleHandler extends AutoscaleHandler {
    constructor() {
        super(new AliCloud(), '');
        this._step = '';
        this._selfInstance = null;
        this._masterRecord = null;
        this._selfHealthCheck;
        this.masterScalingGroupName = process.env.AUTO_SCALING_GROUP_NAME;
        this.scalingGroupName = process.env.AUTO_SCALING_GROUP_NAME;
    }

    async init() {
        const success = await this.platform.init();
        this._baseConfig = await this.getBaseConfig();
        return success;
    }

    async handle(event, context, resp, instanceObject) {
        var result;
        var proxyMethod = event.method;
        await this.init();
        if (proxyMethod === 'POST') {
            this._step = 'fortigate:handleSyncedCallback';
            result = await this.handleSyncedCallback(event, instanceObject);
            return JSON.stringify(result);
        } else if (proxyMethod === 'GET') {
            this._step = 'fortigate:getConfig';
            result = await this.getBaseConfig();
            result = await this.handleGetConfig(event, context);
            return result;
        } else {
            this._step = '¯\\_(ツ)_/¯';
            logger.log(`${this._step} unexpected event!`, event);
        }
    }

    async completeGetConfigLifecycleAction(instanceId, success) {
        return await Promise.resolve(true);
    }

    async getMasterInfo() {
        let instanceId;
        try {
            this._masterRecord = this._masterRecord || await this.platform.getMasterRecord();
            instanceId = this._masterRecord && this._masterRecord.instanceId;
        } catch (ex) {
            console.log('Error in getting master info', ex);
        }

        return this._masterRecord && this._masterRecord.primaryPrivateIpAddress &&
         await this.platform.describeInstance({
             instanceId: instanceId
         });
    }

    async putMasterElectionVote(candidateInstance, purgeMasterRecord = null) {
        try {
            console.log('masterElectionVote, purge master?', JSON.stringify(purgeMasterRecord));
            if (purgeMasterRecord) {
                try {
                    const purged = await this.purgeMaster();
                    this.logger.log('purged: ', purged);
                } catch (error) {
                    console.log('Error in Purging master record. ', error);
                }
            } else {
                console.log('No master to purge');
            }
            return await this.platform.putMasterRecord(candidateInstance, 'pending', 'new');
        } catch (ex) {
            console.log('exception while putMasterElectionVote',
        JSON.stringify(candidateInstance), JSON.stringify(purgeMasterRecord), ex.stack);
            return false;
        }
    }

    async getMasterConfig(callbackUrl) {
        return await this._baseConfig.replace(/\$\{CALLBACK_URL}/, callbackUrl);
    }

    async getBaseConfig() {
        let baseConfig = await this.getConfigSet(process.env.BASE_CONFIG_NAME);
        let psksecret = process.env.FORTIGATE_PSKSECRET,
            fazConfig = '',
            fazIp;
        if (baseConfig) {
            // check if other config set are required
            let requiredConfigSet = process.env.REQUIRED_CONFIG_SET ?
                process.env.REQUIRED_CONFIG_SET.split(',') : [];
            let configContent = '';
            for (let configset of requiredConfigSet) {
                let [name, selected] = configset.trim().split('-');
                if (selected && selected.toLowerCase() === 'yes') {
                    switch (name) {
                        // handle https routing policy
                        case 'httpsroutingpolicy':
                            configContent += await this.getConfigSet('internalelbweb');
                            configContent += await this.getConfigSet(name);
                            break;
                            // handle fortianalyzer logging config
                        case 'storelogtofaz':
                            fazConfig = await this.getConfigSet(name);
                            fazIp = await this.getFazIp();
                            configContent += fazConfig.replace(
                new RegExp('{FAZ_PRIVATE_IP}', 'gm'), fazIp);
                            break;
                        case 'extrastaticroutes':
                            configContent += await this.getConfigSet('extrastaticroutes');
                            break;
                        case 'extraports':
                            configContent += await this.getConfigSet('extraports');
                            break;
                        default:
                            break;
                    }
                }
            }
            baseConfig += configContent;

            baseConfig = baseConfig
        .replace(new RegExp('{SYNC_INTERFACE}', 'gm'),
          process.env.FORTIGATE_SYNC_INTERFACE ?
              process.env.FORTIGATE_SYNC_INTERFACE : 'port1')
        .replace(new RegExp('{EXTERNAL_INTERFACE}', 'gm'), 'port1')
        .replace(new RegExp('{INTERNAL_INTERFACE}', 'gm'), 'port2')
        .replace(new RegExp('{PSK_SECRET}', 'gm'), psksecret)
        .replace(new RegExp('{TRAFFIC_PORT}', 'gm'),
          process.env.FORTIGATE_TRAFFIC_PORT ? process.env.FORTIGATE_TRAFFIC_PORT : 443)
        .replace(new RegExp('{ADMIN_PORT}', 'gm'),
          process.env.FORTIGATE_ADMIN_PORT ? process.env.FORTIGATE_ADMIN_PORT : 8443)
        .replace(new RegExp('{INTERNAL_ELB_DNS}', 'gm'),
          process.env.FORTIGATE_INTERNAL_ELB_DNS ?
              process.env.FORTIGATE_INTERNAL_ELB_DNS : '');
        }
        return baseConfig;
    }


    /** @override */
    async addInstanceToMonitor(instance, heartBeatInterval, masterIp = 'null') {
        console.log('Adding Instance To monitor');
        try {
            var params = {
                tableName: DB.AUTOSCALE.tableMeta.tableName,
                condition: new tableStoreClient.Condition(
                  tableStoreClient.RowExistenceExpectation.IGNORE, null),
                primaryKey: [{
                    instanceId: instance.instanceId
                }],

                attributeColumns: [{
                    HeartBeatLossCount: 0
                },
                {
                    MasterIp: masterIp
                },
                {
                    NextHeartBeatTime: Date.now() + heartBeatInterval * 1000
                },
                {
                    SyncState: 'in-sync'
                },
                {
                    autoScalingGroupName: this.masterScalingGroupName
                },
                {
                    heartBeatInterval: heartBeatInterval
                }

                ],
                returnContent: {
                    returnType: tableStoreClient.ReturnType.Primarykey
                }
            };
            await tablestoreClient.putRow(params, function(err, data) {
                if (err) {
                    console.log('error:', err);
                    return;
                }

                console.log('success:', data);
            });

        } catch (err) {
            console.log('Error updating Instance Health Check', err);
        }
    }

    async checkMasterElection() {
        let masterHealthCheck,
            needElection = false,
            purgeMaster = false,
            electionLock = false,
            electionComplete = false;

        // is there a master election done?
        // check the master record and its voteState

        this._masterRecord = this._masterRecord || await this.platform.getMasterRecord();
        this._masterInfo = this._masterInfo || await this.getMasterInfo(); // Hotfix.
        // if there's a complete election, get master health check
        if (this._masterRecord && this._masterRecord.voteState === 'done') {
            this._masterInfo = this._masterInfo || await this.getMasterInfo();
            if (this._masterInfo) {
                masterHealthCheck =
                    await this.platform.getInstanceHealthCheck({
                        instanceId: this._masterInfo.instanceId
                    });
            }
            // if master is unhealthy, we need a new election
            if (!masterHealthCheck || !masterHealthCheck.healthy || !masterHealthCheck.inSync) {
                purgeMaster = needElection = true;
            } else {
                purgeMaster = needElection = false;
            }
        } else if (this._masterRecord && this._masterRecord.voteState === 'pending') {
            // if there's a pending master election, and if this election is incomplete by
            // the end-time, purge this election and starta new master election. otherwise, wait
            // until it's finished
            needElection = purgeMaster = Date.now() > this._masterRecord.voteEndTime;
        } else {
            // if no master, try to hold a master election
            needElection = true;
            purgeMaster = false;
        }
        // if we need a new master, let's hold a master election!
        // 2019/01/14 add support for cross-scaling groups election
        // only instance comes from the masterScalingGroup can start an election
        // all other instances have to wait
        if (needElection) {
            // if i am in the master group, i can hold a master election
            if (this.scalingGroupName === this.masterScalingGroupName) {
                // can I run the election? (diagram: anyone's holding master election?)
                // try to put myself as the master candidate
                electionLock = await this.putMasterElectionVote(this._selfInstance, purgeMaster);
                if (electionLock) {
                    try {
                        console.log('Awaiting Election complete');
                        electionComplete = await this.electMaster();
                        this._masterRecord = null;
                        this._masterInfo = electionComplete && await this.getMasterInfo();
                    } catch (error) {
                        console.log(error);
                    }
                }
            } else {
                console.log(`This instance (id: ${this._selfInstance.instanceId}) not in ` +
                    'the master group, cannot hold election but wait for someone else to hold ' +
                    'an election.');
            }
        }
        return Promise.resolve(this._masterInfo); // return the new master
    }

    async handleGetConfig(event, context) {
        let
            config,
            masterInfo,
            instanceId = this.platform.extractRequestInfo(event).instanceId;

        this._selfInstance = this._selfInstance ||
        await this.platform.describeInstance({
            instanceId: instanceId,
            scalingGroupName: this.scalingGroupName
        });

        let promiseEmitter = this.checkMasterElection.bind(this),
            validator = result => {
                if (result &&
                    result.primaryPrivateIpAddress === this._selfInstance.primaryPrivateIpAddress) {
                    return true;
                } else if (this._masterRecord && this._masterRecord.voteState === 'pending') {
                    // master election not done, wait for a moment
                    // clear the current master record cache and get a new one in the next call
                    this._masterRecord = null;
                } else if (this._masterRecord && this._masterRecord.voteState === 'done') {
                    // master election done
                    return true;
                }
                return false;
            },
            counter = () => {
                if (Date.now() < SCRIPT_EXECUTION_EXPIRE_TIME - 3000) {
                    return false;
                }
                logger.warn('script execution is about to expire');
                return true;
            };

        try {
            masterInfo = await AutoScaleCore.waitFor(promiseEmitter, validator, 5000, counter);
        } catch (error) {
            // if error occurs, check who is holding a master election, if it is this instance,
            // terminates this election. then tear down this instance whether it's master or not.
            this._masterRecord = this._masterRecord || await this.platform.getMasterRecord();
            // Instance is captilized in AliCloud
            if (this._masterRecord.InstanceId === this._selfInstance.InstanceId &&
                this._masterRecord.asgName === this._selfInstance.scalingGroupName) {
                await this.platform.removeMasterRecord();
            }
            await this.removeInstance(this._selfInstance);
            throw new Error('Failed to determine the master instance. This instance is unable' +
                ' to bootstrap. Please report this to' +
                ' administrators.');
        }

        // the master ip same as mine? (diagram: master IP same as mine?)
        if (masterInfo != null &&
           masterInfo.primaryPrivateIpAddress === this._selfInstance.primaryPrivateIp) {
            this._step = 'handler:getConfig:getMasterConfig';
            config = await this.getMasterConfig(
                await this.platform.getCallbackEndpointUrl(context));
            logger.info('called handleGetConfig: returning master config' +
                `(master-ip: ${masterInfo.primaryPrivateIpAddress}):\n ${config}`);
            console.log('Returning Master Config');
            return config;
        } else {
            this._step = 'handler:getConfig:getSlaveConfig';
            config = await this.getSlaveConfig(masterInfo.primaryPrivateIpAddress,
        await this.platform.getCallbackEndpointUrl(context));
            logger.info('called handleGetConfig: returning slave config' +
                `(master-ip: ${masterInfo.primaryPrivateIpAddress}):\n ${config}`);
            console.log('Returning Slave Config');
            return config;
        }
    }

    async removeInstance(instance) {
        return await this.platform.terminateInstanceInAutoScalingGroup(instance);
    }
    // Override the function to pass info parsed from body as InstanceObject.
    async handleSyncedCallback(event, instanceObject) {
        const {
                instanceId,
                interval,
                status
            } =
            this.platform.extractRequestInfo(event, instanceObject),
            statusSuccess = status && status === 'success' || false;

        let parameters = {},
            masterHealthCheck, lifecycleShouldAbandon = false;

        parameters.instanceId = instanceId;
        parameters.scalingGroupName = this.scalingGroupName;
        // get selfinstance
        this._selfInstance = this._selfInstance || await this.platform.describeInstance(parameters);
        this._selfInstance.primaryPrivateIpAddress = this._selfInstance.primaryPrivateIp;
        if (!this._selfInstance) {
            // not trusted
            throw new Error(`Unauthorized calling instance (vmid: ${instanceId}). ` +
                'Instance not found in scale set.');
        }
        // handle hb monitor
        // get self health check
        this._selfHealthCheck = this._selfHealthCheck ||
        await this.platform.getInstanceHealthCheck({
            instanceId: this._selfInstance.instanceId
        }, interval);
        // if self is already out-of-sync, skip the monitoring logics

        if (this._selfHealthCheck && !this._selfHealthCheck.inSync) {
            return {};
        }
        // get master instance monitoring
        this._masterInfo = this._masterInfo || await this.getMasterInfo();

        if (this._masterInfo) {
            masterHealthCheck = await this.platform.getInstanceHealthCheck({
                instanceId: this._masterInfo.instanceId,
                asgName: this.masterScalingGroupName
            }, interval);
        }

        // if this instance is the master, skip checking master election
        if (this._masterInfo && this._selfInstance.instanceId === this._masterInfo.instanceId &&
            this.scalingGroupName === this.masterScalingGroupName) {
            // use master health check result as self health check result
            this._selfHealthCheck = masterHealthCheck;
        } else if (this._selfHealthCheck && !this._selfHealthCheck.healthy) {
            // if this instance is unhealth, skip master election check

        } else if (!(this._masterInfo && masterHealthCheck && masterHealthCheck.healthy)) {
            // if no master or master is unhealthy, try to run a master election or check if a
            // master election is running then wait for it to end
            // promiseEmitter to handle the master election process by periodically check:
            // 1. if there is a running election, then waits for its final
            // 2. if there isn't a running election, then runs an election and complete it
            let promiseEmitter = this.checkMasterElection.bind(this),
                // validator set a condition to determine if the fgt needs to keep waiting or not.
                validator = masterInfo => {
                    // if i am the new master, don't wait, continue to finalize the election.
                    // should return yes to end the waiting.
                    if (masterInfo &&
                        masterInfo.primaryPrivateIpAddress ===
                        this._selfInstance.primaryPrivateIpAddress) {
                        return true;
                    } else if (this._masterRecord && this._masterRecord.voteState === 'pending') {
                        // if i am not the new master, and the new master hasn't come up to
                        // finalize the election, I should keep on waiting.
                        // should return false to continue.
                        this._masterRecord = null; // clear the master record cache
                        return false;
                    } else if (this._masterRecord && this._masterRecord.voteState === 'done') {
                        // if i am not the new master, and the master election is final, then no
                        // need to wait.
                        // should return true to end the waiting.
                        return true;
                    } else {
                        // no master elected yet
                        // entering this syncedCallback function means i am already insync so
                        // i used to be assigned a master.
                        // if i am not in the master scaling group then I can't start a new
                        // election.
                        // i stay as is and hoping for someone in the master scaling group
                        // triggers a master election. Then I will be notified at some point.
                        if (this.scalingGroupName !== this.masterScalingGroupName) {
                            return true;
                        } else {
                            // for new instance or instance in the master scaling group
                            // they should keep on waiting
                            return false;
                        }
                    }
                },
                // counter to set a time based condition to end this waiting. If script execution
                // time is close to its timeout (6 seconds - abount 1 inteval + 1 second), ends the
                // waiting to allow for the rest of logic to run
                counter = currentCount => {
                    if (Date.now() < SCRIPT_EXECUTION_EXPIRE_TIME - 6000) {
                        return false;
                    }
                    console.log('script execution is about to expire');
                    return true;
                };

            try {
                this._masterInfo = await CoreFunctions.waitFor(
                  promiseEmitter, validator, 5000, counter);
                // after new master is elected, get the new master healthcheck
                // there are two possible results here:
                // 1. a new instance comes up and becomes the new master, master healthcheck won't
                // exist yet because this instance isn't added to monitor.
                //   1.1. in this case, the instance will be added to monitor.
                // 2. an existing slave instance becomes the new master, master healthcheck exists
                // because the instance in under monitoring.
                //   2.1. in this case, the instance will take actions based on its healthcheck
                //        result.
                masterHealthCheck = await this.platform.getInstanceHealthCheck({
                    instanceId: this._masterInfo.instanceId
                }, interval);
            } catch (error) {
                console.log(error);
                // if error occurs, check who is holding a master election, if it is this instance,
                // terminates this election. then continue
                this._masterRecord = this._masterRecord || await this.platform.getMasterRecord();

                if (this._masterRecord.instanceId === this._selfInstance.instanceId &&
                    this._masterRecord.asgName === this._selfInstance.scalingGroupName) {
                    await this.platform.removeMasterRecord();
                }
                await this.removeInstance(this._selfInstance);
                throw new Error('Failed to determine the master instance within ' +
          `${process.env.SCRIPT_EXECUTION_EXPIRE_TIME} seconds. This instance is unable` +
          ' to bootstrap. Please report this to administrators.');
            }
        }

        // check if myself is under health check monitoring
        // (master instance itself may have got its healthcheck result in some code blocks above)
        this._selfHealthCheck = this._selfHealthCheck ||
        await this.platform.getInstanceHealthCheck({
            instanceId: this._selfInstance.instanceId
        }, interval);

        // if this instance is the master instance and the master record is still pending, finalize
        // the master election only in these two condition:
        // 1. this instance is under monitor and is healthy
        // 2. this instance is new and sending a respond with 'status: success'
        this._masterRecord = this._masterRecord || await this.platform.getMasterRecord();

        if (this._masterInfo && this._selfInstance.instanceId === this._masterInfo.instanceId &&
        this.scalingGroupName === this.masterScalingGroupName &&
        this._masterRecord && this._masterRecord.voteState === 'pending') {
            if (this._selfHealthCheck && this._selfHealthCheck.healthy ||
                !this._selfHealthCheck && statusSuccess) {
                // if election couldn't be finalized, remove the current election so someone else
                // could start another election
                if (!await this.platform.finalizeMasterElection()) {
                    await this.platform.removeMasterRecord();
                    this._masterRecord = null;
                    lifecycleShouldAbandon = true;
                }
            }
        }

        if (!this._selfHealthCheck && this._masterInfo) {
            // according to some investigations, in some cases FortiGate may not send the
            // status:success callback right after it consumed the config from GET. Instead,
            // regular heart beat callbacks were sent first, whereas the regular work flow expects
            // that the FortiGate sends a callback with status:success in the immediate following
            // POST request.
            // In order to impose a strict monitoring work flow, all those unexpected heart beat
            // callback requests (POST) will be bypassed.
            if (statusSuccess) {
                await this.addInstanceToMonitor(this._selfInstance, interval,
                    this._masterInfo.primaryPrivateIpAddress);
                console.log(`instance (id:${this._selfInstance.instanceId}, ` +
                    `ip: ${this._selfInstance.primaryPrivateIpAddress}) is added to monitor.`);
                // if this newly come-up instance is the new master, save its instance id as the
                // default password into settings because all other instance will sync password from
                // the master there's a case if users never changed the master's password, when the
                // master was torn-down, there will be no way to retrieve this original password.
                // so in this case, should keep track of the update of default password.
                if (this._selfInstance.instanceId === this._masterInfo.instanceId &&
                    this.scalingGroupName === this.masterScalingGroupName) {
                    await this.platform.setSettingItem('fortigate-default-password', {
                        value: this._selfInstance.instanceId,
                        description: 'default password comes from the new elected master.'
                    });
                }
            } else {
                console.log('Unexpected heart beat callback request found because status:' +
                    'success request hasn\'t been received yet. Not add instance to monitor. ' +
                    'Bypass this request.');
            }
            return '';
        } // else if (this._selfHealthCheck && this._selfHealthCheck.healthy && this._masterInfo)
        else if (this._selfHealthCheck && this._masterInfo) {
            // for those already in monitor, if there's a healthy master instance, keep track of
            // the master ip and notify the instanc with any change of the master ip.
            // if no master present (due to errors in master election), keep what ever master ip
            // it has, keep it in-sync without any notification for change in master ip.
            let masterIp = this._masterInfo && masterHealthCheck && masterHealthCheck.healthy ?
                this._masterInfo.primaryPrivateIpAddress : this._selfHealthCheck.masterIp;
            await this.platform.updateInstanceHealthCheck(this._selfHealthCheck, interval, masterIp,
        Date.now());

            return {
                'master-ip': masterIp
            };
        } else {
            // this.logger.info('instance is unhealthy. need to remove it. healthcheck record:',
            //  JSON.stringify(this._selfHealthCheck));
            // for unhealthy instances
            // if it is previously on 'in-sync' state, mark it as 'out-of-sync' so script will stop
            // keeping it in sync and stop doing any other logics for it any longer.
            if (this._selfHealthCheck && this._selfHealthCheck.inSync) {
                // change its sync state to 'out of sync' by updating it state one last time
                await this.platform.updateInstanceHealthCheck(this._selfHealthCheck, interval,
                    this._masterInfo ? this._masterInfo.primaryPrivateIpAddress : null,
                    Date.now(), true);
                // terminate it from autoscaling group
                await this.removeInstance(this._selfInstance);
            }
            // for unhealthy instances, keep responding with action 'shutdown'
            return {
                action: 'shutdown'
            };
        }
    }
}
module.exports.handler = async function(req, resp,context) {
    var handle = new AliCloud();
    var handler = new AliCloudAutoscaleHandler();
    // Parse Alicloud Buffer raw_body and pass to handleGetConfig.
    var getBody = await getRawBody(req);
    var getBodyTostring = getBody.toString();
    if (getBodyTostring.length >= 1) {
        var aBody = JSON.parse(getBodyTostring);
    }
    // Call the main function
    var result = await handler.handle(req,context,resp,aBody);
    resp.send(result);
};


exports.moduleRuntimeId = () => moduleId;
exports.AutoScaleCore = AutoScaleCore;
exports.AliCloud = AliCloud;
exports.AliCloudAutoscaleHandler = AliCloudAutoscaleHandler;
exports.settingItems = settingItems;
exports.logger = logger;
