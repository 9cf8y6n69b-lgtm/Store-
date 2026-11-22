// ═══════════════════════════════════════════════
//  NOVA STORE • اشتراكاتي
//  لوحة بصورة + زر «اشتراكاتي» ← العضو يشوف اشتراكاته ويتحكم: تجديد / تذكير / إلغاء
//  + تذكير تلقائي في الخاص قبل الانتهاء
// ═══════════════════════════════════════════════
const client = require("../index");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const Subs = require("../utils/subs");
const St = require("../utils/store");
const banner = require("../../banner");

const EPH = 64, COLOR = 0x9b6bff;

async function panelPayload() {
    const c = Subs.cfg();
    const img = c.banner ? await banner.panelCard({ title: c.title, sub: c.sub, chips: ["المدة", "التذكير", "التجديد"] }).catch(() => null) : null;
    const e = new EmbedBuilder().setColor(COLOR).setTitle("🧩 اشتراكاتي").setDescription(c.sub).setFooter({ text: "NOVA STORE" });
    if (img) e.setImage("attachment://subs.png");
    return {
        embeds: [e], files: img ? [new AttachmentBuilder(img, { name: "subs.png" })] : [],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("sb:open").setLabel("اشتراكاتي").setEmoji("🧩").setStyle(ButtonStyle.Secondary))]
    };
}
async function sendPanel(channel) { return channel.send(await panelPayload()); }

const line = s => `${Subs.ICON[Subs.state(s)]} ${s.emoji} **${s.name}** — ${s.status === "cancelled" ? "ملغي" : `${Subs.left(s) <= 0 ? "انتهى" : "ينتهي"} <t:${Subs.ts(s.expires)}:R>`}`;

function listView(uid) {
    const subs = Subs.ofUser(uid);
    const e = new EmbedBuilder().setColor(COLOR).setTitle("🧩 اشتراكاتك").setFooter({ text: "NOVA STORE • اختر اشتراكاً من القائمة للتحكم فيه" });
    if (!subs.length) return { embeds: [e.setDescription("ما عندك اشتراكات للحين.\nاشتر من المتجر داخل التكت 🛒 وراح يظهر اشتراكك هنا بعد التسليم.")], components: [] };
    e.setDescription(subs.slice(0, 25).map(line).join("\n"));
    const menu = new StringSelectMenuBuilder().setCustomId("sb:pick").setPlaceholder("اختر اشتراكاً للتحكم فيه")
        .addOptions(subs.slice(0, 25).map(s => ({ label: s.name.slice(0, 100), value: String(s.id), emoji: s.emoji || undefined, description: `${Subs.TXT[Subs.state(s)]}`.slice(0, 100) })));
    return { embeds: [e], components: [new ActionRowBuilder().addComponents(menu)] };
}
function detailView(s) {
    const st = Subs.state(s), closed = s.status === "cancelled";
    const e = new EmbedBuilder().setColor(st === "expired" ? 0xef476f : st === "soon" ? 0xffa94d : COLOR).setTitle(`${s.emoji} ${s.name}`).addFields(
        { name: "الحالة", value: `${Subs.ICON[st]} ${Subs.TXT[st]}`, inline: true },
        { name: closed ? "انتهى بتاريخ" : Subs.left(s) <= 0 ? "انتهى" : "ينتهي", value: `<t:${Subs.ts(s.expires)}:F>\n<t:${Subs.ts(s.expires)}:R>`, inline: true },
        { name: "بدأ", value: `<t:${Subs.ts(s.start)}:D>`, inline: true },
        { name: "🔔 التذكير في الخاص", value: s.reminders ? "مفعّل" : "متوقف", inline: true },
        { name: "🔄 طلب التجديد", value: s.renewReq ? `أُرسل <t:${Subs.ts(s.renewReq)}:R>` : "ما أُرسل", inline: true }
    ).setFooter({ text: `اشتراك #${s.id} • NOVA STORE` });
    if (s.orderId) e.addFields({ name: "الطلب", value: `#${s.orderId}`, inline: true });
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sb:renew:${s.id}`).setLabel("طلب تجديد").setEmoji("🔄").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sb:rem:${s.id}`).setLabel(s.reminders ? "إيقاف التذكير" : "تفعيل التذكير").setEmoji("🔔").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`sb:cancel:${s.id}`).setLabel("إلغاء الاشتراك").setEmoji("✖️").setStyle(ButtonStyle.Danger).setDisabled(closed),
        new ButtonBuilder().setCustomId("sb:back").setLabel("رجوع").setEmoji("↩️").setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [e], components: [row] };
}

async function staffNotice(guild, embed) {
    const id = St.cfg().logChannel, ch = id && guild.channels.cache.get(id); if (!ch) return;
    const role = Subs.cfg().pingRole;
    ch.send({ content: role ? `<@&${role}>` : undefined, embeds: [embed], allowedMentions: { roles: role ? [role] : [] } }).catch(() => {});
}

async function onInteraction(i) {
    const [, act, id] = String(i.customId).split(":");
    if (act === "open") return i.reply({ ...listView(i.user.id), flags: EPH });
    if (act === "back") return i.update(listView(i.user.id));
    const pick = act === "pick" ? Subs.get(i.values[0]) : Subs.get(id);
    if (!pick || pick.userId !== i.user.id) return i.reply({ content: "❌ هذا مو اشتراكك أو انحذف.", flags: EPH });
    if (act === "pick") return i.update(detailView(pick));
    if (act === "rem") { const s = Subs.update(pick.id, x => { x.reminders = !x.reminders; }); return i.update(detailView(s)); }
    if (act === "renew") {
        if (pick.renewReq && Date.now() - pick.renewReq < 6 * 3600e3) return i.reply({ content: "⏳ أرسلت طلب تجديد قبل شوي، الإدارة بتتواصل معك.", flags: EPH });
        const s = Subs.update(pick.id, x => { x.renewReq = Date.now(); });
        staffNotice(i.guild, new EmbedBuilder().setColor(0x06d6a0).setTitle(`🔄 طلب تجديد — اشتراك #${s.id}`).setDescription(`${i.user} يطلب تجديد **${s.name}**\nينتهي <t:${Subs.ts(s.expires)}:R>\nافتح له تكت أو مدّد من الداشبورد ← الاشتراكات.`));
        return i.update(detailView(s));
    }
    if (act === "cancel") {
        const s = Subs.update(pick.id, x => { x.status = "cancelled"; });
        staffNotice(i.guild, new EmbedBuilder().setColor(0xef476f).setTitle(`✖️ إلغاء اشتراك #${s.id}`).setDescription(`${i.user} ألغى اشتراك **${s.name}**`));
        return i.update(detailView(s));
    }
}
client.on("interactionCreate", async i => {
    try {
        if (!i.guild || !(i.isButton() || i.isStringSelectMenu())) return;
        if (!String(i.customId || "").startsWith("sb:")) return;
        await onInteraction(i);
    } catch (e) {
        console.error("[SUBS]", e);
        const m = { content: "⚠️ صار خطأ، حاول مرة ثانية", flags: EPH };
        (i.replied || i.deferred ? i.followUp(m) : i.reply(m)).catch(() => {});
    }
});

// تذكير تلقائي في الخاص: قبل الانتهاء بـ N أيام، وعند الانتهاء
async function remindTick() {
    if (!client.isReady()) return;
    const days = [...Subs.cfg().remindDays].map(Number).sort((a, b) => b - a), now = Date.now();
    for (const s of Subs.all()) {
        if (!s.reminders || s.status !== "active") continue;
        const left = s.expires - now;
        // stage: 0 = لا شيء، k = تم تذكير أول k من days، days.length+1 = تم تنبيه الانتهاء
        let want = 0; days.forEach((d, k) => { if (left <= d * Subs.DAY) want = k + 1; }); if (left <= 0) want = days.length + 1;
        if (want > (s.stage || 0)) {
            Subs.update(s.id, x => { x.stage = want; });
            const msg = left <= 0 ? `🔴 انتهى اشتراكك **${s.name}**. اطلب التجديد من لوحة «اشتراكاتي» أو افتح تكت.` : `🟠 اشتراكك **${s.name}** ينتهي <t:${Subs.ts(s.expires)}:R>. جدّده من لوحة «اشتراكاتي» 🧩`;
            client.users.fetch(s.userId).then(u => u.send(msg)).catch(() => {});
        }
    }
}
setInterval(() => remindTick().catch(() => {}), 30 * 60 * 1000);
setTimeout(() => remindTick().catch(() => {}), 60 * 1000);

module.exports = { sendPanel, panelPayload };
