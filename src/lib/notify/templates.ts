import { fmtDateLong, fmtTime } from "../time";

export interface MsgContext {
  studio: string;
  customerName: string;
  serviceName: string;
  start: Date;
  end: Date;
  cancelUrl: string;
  bookUrl: string;
  isClass: boolean;
  cancelHours: number;
  extra?: string;
}

const first = (n: string) => n.trim().split(" ")[0] || n;
const when = (c: MsgContext) => `${fmtDateLong(c.start)} um ${fmtTime(c.start)} Uhr`;

export const templates = {
  confirmation: (c: MsgContext) => ({
    subject: `Termin bestätigt: ${c.serviceName} am ${fmtDateLong(c.start)}`,
    text:
`Hallo ${first(c.customerName)},

dein Termin ist gebucht:

${c.serviceName}
${when(c)} (bis ${fmtTime(c.end)} Uhr)

Wir erinnern dich 24 Stunden vorher. Kostenlos stornieren kannst du bis ${c.cancelHours} Stunden vor dem Termin über diesen Link:
${c.cancelUrl}

Bis bald!
${c.studio}`,
    short: `${c.studio}: Dein Termin ${c.serviceName} am ${when(c)} ist bestätigt. Stornieren: ${c.cancelUrl}`,
  }),
  reminder: (c: MsgContext) => ({
    subject: `Erinnerung: ${c.serviceName} morgen um ${fmtTime(c.start)} Uhr`,
    text:
`Hallo ${first(c.customerName)},

kleine Erinnerung: morgen, ${when(c)}, ist dein Termin ${c.serviceName}.

Falls du nicht kommen kannst, sag bitte rechtzeitig ab – dann kann jemand anderes den Termin bekommen:
${c.cancelUrl}

Bis morgen!
${c.studio}`,
    short: `${c.studio}: Erinnerung – morgen ${fmtTime(c.start)} Uhr ${c.serviceName}. Absagen: ${c.cancelUrl}`,
  }),
  cancellation: (c: MsgContext) => ({
    subject: `Leider abgesagt: ${c.serviceName} am ${fmtDateLong(c.start)}`,
    text:
`Hallo ${first(c.customerName)},

dein Termin ${c.serviceName} am ${when(c)} muss leider ausfallen${c.extra ? ` (${c.extra})` : ""}. Es tut uns leid!

Hier kannst du direkt einen neuen Termin buchen:
${c.bookUrl}

Liebe Grüße
${c.studio}`,
    short: `${c.studio}: Dein Termin ${c.serviceName} am ${when(c)} muss leider ausfallen. Neu buchen: ${c.bookUrl}`,
  }),
  change: (c: MsgContext) => ({
    subject: `Termin geändert: ${c.serviceName} jetzt am ${fmtDateLong(c.start)}`,
    text:
`Hallo ${first(c.customerName)},

dein Termin wurde verschoben. Neuer Termin:

${c.serviceName}
${when(c)} (bis ${fmtTime(c.end)} Uhr)

Passt es nicht? Stornieren oder neu buchen:
${c.cancelUrl}

Liebe Grüße
${c.studio}`,
    short: `${c.studio}: Dein Termin ${c.serviceName} ist jetzt am ${when(c)}. Passt nicht? ${c.cancelUrl}`,
  }),
  cancel_ack: (c: MsgContext) => ({
    subject: `Storniert: ${c.serviceName} am ${fmtDateLong(c.start)}`,
    text:
`Hallo ${first(c.customerName)},

wie besprochen haben wir deinen Termin ${c.serviceName} am ${when(c)} storniert.

Neuen Termin buchen: ${c.bookUrl}

Liebe Grüße
${c.studio}`,
    short: `${c.studio}: Dein Termin ${c.serviceName} am ${when(c)} ist storniert. Neu buchen: ${c.bookUrl}`,
  }),
  freed_slot: (c: MsgContext) => ({
    subject: `Kurzfristig frei: ${c.serviceName} am ${fmtDateLong(c.start)}`,
    text:
`Hallo ${first(c.customerName)},

du wolltest Bescheid wissen, wenn kurzfristig etwas frei wird:

${c.serviceName}
${when(c)}

Wer zuerst bucht, hat den Termin:
${c.bookUrl}

Liebe Grüße
${c.studio}`,
    short: `${c.studio}: Kurzfristig frei – ${c.serviceName} am ${when(c)}. Jetzt buchen: ${c.bookUrl}`,
  }),
};
export type TemplateType = keyof typeof templates;
