import nodemailer from 'nodemailer';
import { AlertItem } from '../types.js';
import { recordAlertDelivery } from '../database/db.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from?: string;
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    user,
    pass,
    from: process.env.SMTP_FROM || `"Construction Weather Monitor" <${user}>`
  };
}

export async function isSmtpConfigured(): Promise<boolean> {
  return getSmtpConfig() !== null;
}

export async function sendAlertEmail(
  alert: AlertItem,
  recipientEmail: string,
  affectedActivities: string[] = []
): Promise<{ success: boolean; error?: string }> {
  const config = getSmtpConfig();

  if (!config) {
    const errorMsg = 'SMTP credentials are not configured in environment variables.';
    await recordAlertDelivery({
      alertId: alert.id,
      alertType: alert.alertType,
      recipientEmail,
      sentAt: new Date().toISOString(),
      status: 'FAILED',
      errorMessage: errorMsg
    });
    return { success: false, error: errorMsg };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const subject = `${alert.alertType} — Construction Weather Monitor`;
  const activitiesList = affectedActivities.length > 0
    ? affectedActivities.map((a) => `• ${a}`).join('\n')
    : '• Crane operations\n• Scaffold work\n• Roof work\n• Outdoor work';

  const textBody = `
${alert.alertType}

Location:
${alert.locationName}

Observed / Expected value:
${alert.observedValue}

Configured threshold:
${alert.thresholdValue}

Expected period:
${alert.startTime} (${alert.expectedDuration})

Risk:
${alert.severity}

Potentially affected activities:
${activitiesList}

Review applicable project procedures, SWMS, equipment requirements and manufacturer limits.

Weather data:
Open-Meteo Operational Meteorological Service

Notification timestamp:
${new Date().toLocaleString()}
`.trim();

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border-radius: 8px;">
  <div style="border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px;">
    <span style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b;">Construction Weather Monitor</span>
    <h1 style="margin: 6px 0 0 0; font-size: 20px; font-weight: 800; color: ${
      alert.severity === 'CRITICAL' ? '#dc2626' : alert.severity === 'HIGH' ? '#ea580c' : '#d97706'
    };">${alert.title}</h1>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 40%;">Location</td>
      <td style="padding: 8px 0; font-weight: 700; color: #0f172a;">${alert.locationName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Observed / Expected Value</td>
      <td style="padding: 8px 0; font-weight: 700; color: #0f172a;">${alert.observedValue}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Configured Threshold</td>
      <td style="padding: 8px 0; color: #334155;">${alert.thresholdValue}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Expected Period</td>
      <td style="padding: 8px 0; color: #334155;">${alert.startTime} (${alert.expectedDuration})</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Risk Level</td>
      <td style="padding: 8px 0; font-weight: 800; color: ${
        alert.severity === 'CRITICAL' ? '#dc2626' : alert.severity === 'HIGH' ? '#ea580c' : '#d97706'
      };">${alert.severity}</td>
    </tr>
  </table>

  <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase;">Potentially Affected Activities</h3>
    <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.6;">
      ${(affectedActivities.length > 0 ? affectedActivities : ['Crane operations', 'Scaffold work', 'Roof work', 'Working at height'])
        .map((act) => `<li>${act}</li>`)
        .join('')}
    </ul>
  </div>

  <p style="font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 14px; margin-top: 20px;">
    Review applicable site procedures, SWMS, equipment requirements and manufacturer limits. The system is a weather-risk monitoring tool. It is not a replacement for professional safety judgement.
  </p>
  <p style="font-size: 11px; color: #94a3b8; margin: 4px 0 0 0;">
    Weather data: Open-Meteo · Notification sent ${new Date().toLocaleTimeString()}
  </p>
</div>
  `.trim();

  try {
    await transporter.sendMail({
      from: config.from,
      to: recipientEmail,
      subject,
      text: textBody,
      html: htmlBody
    });

    await recordAlertDelivery({
      alertId: alert.id,
      alertType: alert.alertType,
      recipientEmail,
      sentAt: new Date().toISOString(),
      status: 'SUCCESS'
    });

    return { success: true };
  } catch (err: any) {
    const errorMsg = err?.message || 'SMTP delivery failed';
    await recordAlertDelivery({
      alertId: alert.id,
      alertType: alert.alertType,
      recipientEmail,
      sentAt: new Date().toISOString(),
      status: 'FAILED',
      errorMessage: errorMsg
    });
    return { success: false, error: errorMsg };
  }
}

export async function sendRecoveryEmail(
  alert: AlertItem,
  recipientEmail: string,
  currentValue: string
): Promise<{ success: boolean; error?: string }> {
  const config = getSmtpConfig();
  if (!config) return { success: false, error: 'SMTP not configured' };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false }
  });

  const subject = `WEATHER ALERT CLEARED — ${alert.alertType} — Construction Weather Monitor`;
  const textBody = `
WEATHER ALERT CLEARED

${alert.alertType} conditions have returned below the configured threshold.

Location:
${alert.locationName}

Current observed value:
${currentValue}

Configured threshold:
${alert.thresholdValue}

Cleared time:
${new Date().toLocaleTimeString()}

Review applicable site procedures and equipment operating requirements before resuming full operations.
`.trim();

  try {
    await transporter.sendMail({
      from: config.from,
      to: recipientEmail,
      subject,
      text: textBody
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to send recovery email' };
  }
}

export async function sendTestEmail(recipientEmail: string): Promise<{ success: boolean; error?: string }> {
  const config = getSmtpConfig();
  if (!config) {
    return {
      success: false,
      error: 'SMTP credentials not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.'
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false }
  });

  const subject = 'Test Notification — Construction Weather Monitor';
  const textBody = `
This is a test notification from your local Construction Weather Monitor.

System: Private Local Construction Weather Monitor
Destination: ${recipientEmail}
Time: ${new Date().toLocaleString()}
SMTP Host: ${config.host}

Your email notification service is properly configured and functional.
`.trim();

  try {
    await transporter.sendMail({
      from: config.from,
      to: recipientEmail,
      subject,
      text: textBody
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'SMTP delivery failed' };
  }
}
