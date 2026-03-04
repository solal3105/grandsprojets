var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// netlify/functions/send-contact-email.js
var send_contact_email_exports = {};
__export(send_contact_email_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(send_contact_email_exports);
async function handler(event) {
  return {
    statusCode: 410,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      error: "Cette fonction est d\xE9pr\xE9ci\xE9e. Utiliser le syst\xE8me Supabase \xE0 la place."
    })
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
//# sourceMappingURL=send-contact-email.js.map
