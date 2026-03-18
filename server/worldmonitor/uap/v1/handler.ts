import type { UapServiceHandler } from '../../../../src/generated/server/worldmonitor/uap/v1/service_server';

import { listUapSightings } from './list-uap-sightings';
import { listUapInstitutionalReports } from './list-uap-institutional-reports';
import { listUapSensorStations } from './list-uap-sensor-stations';
import { getAaiScores } from './get-aai-scores';

export const uapHandler: UapServiceHandler = {
  listUapSightings,
  listUapInstitutionalReports,
  listUapSensorStations,
  getAaiScores,
};
