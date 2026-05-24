/**
 * Thai localization for feature names
 * ML layer returns technical names; frontend maps to human-readable Thai labels
 */
export const FEATURE_LABELS: Record<string, string> = {
  days_since_last_send:     "ไม่ส่งข้อความมา",
  days_since_last_access:   "ไม่ login มา",
  days_until_sms_expire:     "เครดิต SMS หมดอายุใน",
  days_until_email_expire:   "เครดิต Email หมดอายุใน",
  usage_recent_3m:           "ใช้งาน (3 เดือนล่าสุด)",
  usage_months:              "เคย active",
  usage_decay_ratio:         "Usage ลดลง",
  pay_recency_days:          "ไม่ซื้อเครดิตมา",
  pay_overdue_ratio:         "เกินรอบซื้อปกติ",
  credit_sms_log:            "เครดิต SMS เหลือน้อย",
  days_since_join:           "สมัครมาแล้ว",
  pay_monetary_log:          "มูลค่าการซื้อ (log)",
  pay_avg_amount:            "เฉลี่ยต่อครั้ง",
  pay_total_credits:         "รวมเครดิตที่ซื้อ",
  pay_frequency:             "จำนวนครั้งที่ซื้อ",
  usage_total_log:           "ใช้งานรวม (log)",
  usage_avg:                 "เฉลี่ยต่อเดือน",
  usage_max:                 "ใช้งานสูงสุด",
  usage_slope:               "แนวโน้มการใช้",
  is_paid_sms:               "สถานะ SMS",
  is_paid_email:             "สถานะ Email",
  pay_n_sms:                 "จำนวนครั้งซื้อ SMS",
  pay_n_email:              "จำนวนครั้งซื้อ Email",
  usage_sms_total:           "ใช้ SMS รวม",
  usage_email_total:         "ใช้ Email รวม",
  pay_tenure_days:           "ระยะเวลาเป็นลูกค้า",
  pay_avg_interval:          "รอบการซื้อเฉลี่ย",
  credit_email_log:          "เครดิต Email เหลือน้อย",
};

export function formatFeatureLabel(key: string, value: number, suffix?: string): string {
  const label = FEATURE_LABELS[key] || key;
  if (suffix !== undefined) return `${label} ${suffix}`;
  if (key === "days_since_last_send" || key === "days_since_last_access" || key === "pay_recency_days")
    return `${label} ${Math.round(value)} วัน`;
  if (key === "days_until_sms_expire" || key === "days_until_email_expire")
    return `${label} ${Math.round(value)} วัน`;
  if (key === "days_since_join")
    return `${label} ${Math.round(value)} วัน`;
  if (key === "usage_months")
    return `${label} ${Math.round(value)} เดือน`;
  if (key === "usage_recent_3m" || key === "usage_total_log")
    return `${label} ${Math.round(value).toLocaleString()}`;
  if (key === "usage_decay_ratio")
    return `Usage ลดลง (ratio=${value.toFixed(2)})`;
  if (key === "pay_overdue_ratio")
    return `เกินรอบซื้อปกติ ${value.toFixed(1)} เท่า`;
  if (key === "credit_sms_log" || key === "credit_email_log")
    return label;
  if (key === "pay_monetary_log" || key === "pay_avg_amount")
    return `${label} ${Number(value).toLocaleString()} ฿`;
  if (key === "pay_total_credits")
    return `${label} ${Math.round(value).toLocaleString()}`;
  if (key === "usage_avg" || key === "usage_max")
    return `${label} ${Math.round(value).toLocaleString()}`;
  if (key === "usage_slope")
    return value > 0 ? "แนวโน้มใช้งานเพิ่มขึ้น" : "แนวโน้มใช้งานลดลง";
  if (key === "is_paid_sms" || key === "is_paid_email")
    return value > 0 ? "สถานะ PAID" : "สถานะไม่ได้จ่าย";
  if (key === "pay_n_sms" || key === "pay_n_email" || key === "pay_frequency")
    return `${label} ${Math.round(value)} ครั้ง`;
  if (key === "usage_sms_total" || key === "usage_email_total")
    return `${label} ${Math.round(value).toLocaleString()}`;
  if (key === "pay_tenure_days")
    return `${label} ${Math.round(value)} วัน`;
  if (key === "pay_avg_interval")
    return `รอบการซื้อเฉลี่ย ${Math.round(value)} วัน`;
  return `${key} = ${Number(value).toFixed(2)}`;
}
