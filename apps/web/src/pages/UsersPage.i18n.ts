import { defineMessages } from "../i18n";

export const m = defineMessages({
  helpAdmin: {
    en: "Everything, including users, standards and deleting samples",
    hi: "सब कुछ, जिसमें उपयोगकर्ता, मानक और नमूने हटाना शामिल है",
  },
  helpGrader: {
    en: "Create and grade samples, review kernels",
    hi: "नमूने बनाना और ग्रेड करना, दानों की जाँच करना",
  },
  helpViewer: {
    en: "Read-only access to samples and reports",
    hi: "नमूने और रिपोर्ट केवल देख सकते हैं",
  },
  users: { en: "Users", hi: "उपयोगकर्ता" },
  pendingInvites: { en: "Pending invites", hi: "लंबित आमंत्रण" },
  none: { en: "None.", hi: "कोई नहीं।" },
  expires: { en: "expires {date}", hi: "{date} को समाप्त" },
  revoke: { en: "Revoke", hi: "रद्द करें" },
  members: { en: "Members", hi: "सदस्य" },
  you: { en: "you", hi: "आप" },
  disabled: { en: "disabled", hi: "बंद" },
  unconfirmed: { en: " (unconfirmed)", hi: " (पुष्टि नहीं)" },
  lastSignIn: { en: "last sign-in {date}", hi: "पिछला साइन इन {date}" },
  roleOf: { en: "Role of {name}", hi: "{name} की भूमिका" },
  disable: { en: "Disable", hi: "बंद करें" },
  enable: { en: "Enable", hi: "चालू करें" },
  inviteSomeone: { en: "Invite someone", hi: "किसी को आमंत्रित करें" },
  email: { en: "Email", hi: "ईमेल" },
  role: { en: "Role", hi: "भूमिका" },
  sendInvite: { en: "Send invite", hi: "आमंत्रण भेजें" },
  inviteSent: {
    en: "Invite sent. If email isn't set up on the server, share this link (valid 7 days): {link}",
    hi: "आमंत्रण भेज दिया गया। अगर सर्वर पर ईमेल सेट नहीं है, तो यह लिंक भेजें (7 दिन तक मान्य): {link}",
  },
  searchMembers: { en: "Search name or email", hi: "नाम या ईमेल खोजें" },
});
