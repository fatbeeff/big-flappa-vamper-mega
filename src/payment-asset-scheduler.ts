export const PAYMENT_ASSET_ALARM_NAME = "refresh-payment-assets";
export const PAYMENT_ASSET_ALARM_PERIOD_MINUTES = 300;

export interface PaymentAssetAlarmScheduler {
  get(name: string): Promise<{ periodInMinutes?: number } | undefined>;
  create(name: string, alarmInfo: { periodInMinutes: number }): void | Promise<void>;
}

/** Re-establishes the periodic refresh whenever an MV3 worker is started. */
export async function ensurePaymentAssetRefreshAlarm(alarms: PaymentAssetAlarmScheduler): Promise<void> {
  const current = await alarms.get(PAYMENT_ASSET_ALARM_NAME);
  if (current?.periodInMinutes === PAYMENT_ASSET_ALARM_PERIOD_MINUTES) return;
  await alarms.create(PAYMENT_ASSET_ALARM_NAME, { periodInMinutes: PAYMENT_ASSET_ALARM_PERIOD_MINUTES });
}
