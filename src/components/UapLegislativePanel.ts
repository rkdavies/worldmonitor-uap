import { Panel } from './Panel';

export class UapLegislativePanel extends Panel {
  constructor() {
    super({
      id: 'uap-legislative',
      title: 'Legislative & Disclosure',
      showCount: true,
    });
    this.showLoading();
  }
}
