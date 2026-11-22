// المستثنين من الفلاتر: صاحب السيرفر، أونرز البوت، والبوت نفسه
const CC = require("./cmdConfig");
const isTrusted = (guild, id, client) => guild.ownerId === id || CC.owners.includes(id) || (client && client.user && client.user.id === id);
module.exports = { isTrusted };
