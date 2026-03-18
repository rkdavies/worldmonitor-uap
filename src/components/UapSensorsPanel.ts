import { Panel } from './Panel';

export class UapSensorsPanel extends Panel {
  constructor() {
    super({
      id: 'uap-sensors',
      title: 'Sensor Stations',
      showCount: true,
    });
    this.showLoading();
  }
}
