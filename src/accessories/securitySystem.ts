import {
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  NodeCallback,
  Service
} from 'hap-nodejs';
import TydomController, {TydomAccessoryContext} from 'src/controller';
import {PlatformAccessory} from 'src/typings/homebridge';
import {
  TydomDeviceSecuritySystemAlarmMode,
  TydomDeviceSecuritySystemData,
  TydomDeviceSecuritySystemZoneState
} from 'src/typings/tydom';
import {
  addAccessoryService,
  setupAccessoryIdentifyHandler,
  setupAccessoryInformationService,
  getPropValue
} from 'src/utils/accessory';
import debug from 'src/utils/debug';
import assert from 'src/utils/assert';
import {getTydomDeviceData} from 'src/utils/tydom';

const {/* SecuritySystemTargetState, */ SecuritySystemCurrentState} = Characteristic;

const zoneServices = new Map<number, Service>();

const getCurrrentStateForValue = (alarmMode: TydomDeviceSecuritySystemAlarmMode): number =>
  ['ON', 'ZONE'].includes(alarmMode) ? SecuritySystemCurrentState.AWAY_ARM : SecuritySystemCurrentState.DISARMED;

export const setupSecuritySystem = async (accessory: PlatformAccessory, controller: TydomController): Promise<void> => {
  const {UUID: id, context} = accessory;
  const {client} = controller;

  const {deviceId, endpointId} = context as TydomAccessoryContext;
  setupAccessoryInformationService(accessory, controller);
  setupAccessoryIdentifyHandler(accessory, controller);

  // Add the actual accessory Service
  const service = addAccessoryService(accessory, Service.SecuritySystem, `${accessory.displayName}`, true);

  service
    .getCharacteristic(SecuritySystemCurrentState)!
    .on(CharacteristicEventTypes.GET, async (callback: NodeCallback<CharacteristicValue>) => {
      debug(`-> GET SecuritySystemCurrentState for "${id}"`);
      try {
        const data = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceSecuritySystemData;
        const alarmMode = getPropValue<TydomDeviceSecuritySystemAlarmMode>(data, 'alarmMode');
        callback(null, getCurrrentStateForValue(alarmMode));
      } catch (err) {
        callback(err);
      }
    });

  const initialData = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceSecuritySystemData;
  for (let zoneIndex = 1; zoneIndex < 9; zoneIndex++) {
    const zoneState = getPropValue<TydomDeviceSecuritySystemZoneState>(initialData, `zone${zoneIndex}State`);
    if (zoneState === 'UNUSED') {
      continue;
    }
    const zoneService = addAccessoryService(accessory, Service.Switch, `Zone ${zoneIndex}`, false);
    zoneServices.set(zoneIndex, zoneService);
    zoneService.linkedServices = [service];
    zoneService.subtype = `zone_${zoneIndex}`;
    zoneService
      .getCharacteristic(Characteristic.On)!
      .on(CharacteristicEventTypes.GET, async (callback: NodeCallback<CharacteristicValue>) => {
        debug(`-> GET Zone${zoneIndex}On for "${id}"`);
        try {
          const data = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceSecuritySystemData;
          const zoneState = getPropValue<TydomDeviceSecuritySystemZoneState>(data, `zone${zoneIndex}State`);
          callback(null, zoneState === 'ON');
        } catch (err) {
          callback(err);
        }
      });
    // .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
    //   debug(`-> SET Zone${zoneIndex}On value="${value}" for id="${id}"`);
    //   callback(null);
    // });
  }

  // service
  //   .getCharacteristic(SecuritySystemTargetState)!
  //   .on(CharacteristicEventTypes.GET, async (callback: NodeCallback<CharacteristicValue>) => {
  //     debug(`-> GET SecuritySystemTargetState for "${id}"`);
  //     try {
  //       const data = (await getTydomDeviceData(client, {deviceId, endpointId})) as TydomDeviceSecuritySystemData;
  //       const alarmMode = data.find(prop => prop.name === 'alarmMode')!.value;
  //       callback(
  //         null,
  //         ['ON', 'ZONE'].includes(alarmMode as string)
  //           ? SecuritySystemTargetState.AWAY_ARM
  //           : SecuritySystemTargetState.DISARM
  //       );
  //     } catch (err) {
  //       callback(err);
  //     }
  //   })
  //   .on(CharacteristicEventTypes.SET, async (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
  //     debug(`-> SET SecuritySystemTargetState value="${value}" for id="${id}"`);
  //     callback();
  //   });
};

export const updateSecuritySystem = (accessory: PlatformAccessory, updates: Record<string, unknown>[]) => {
  updates.forEach(update => {
    const {name} = update;
    switch (name) {
      case 'alarmMode': {
        const service = accessory.getService(Service.SecuritySystem);
        assert(service, `Unexpected missing service "${Service.SecuritySystem} in accessory`);
        const alarmMode = update!.value as TydomDeviceSecuritySystemAlarmMode;
        service.getCharacteristic(SecuritySystemCurrentState)!.updateValue(getCurrrentStateForValue(alarmMode));
        return;
      }
      case 'zone1State':
      case 'zone2State':
      case 'zone3State':
      case 'zone4State':
      case 'zone5State':
      case 'zone6State':
      case 'zone7State':
      case 'zone8State': {
        const zoneIndex = parseInt(name.match(/zone(\d+)State/)![1], 10);
        const service = zoneServices.get(zoneIndex);
        assert(service, `Unexpected missing service "${Service.SecuritySystem} in accessory`);
        const zoneState = update!.value as TydomDeviceSecuritySystemZoneState;
        service.getCharacteristic(Characteristic.On)!.updateValue(zoneState === 'ON');
        return;
      }
      default:
        return;
    }
  });
};
