const { assetPath } = require('./files');
const { AttachmentBuilder } = require('discord.js');
const { S } = require('./db');

const asset = (f) => new AttachmentBuilder(assetPath(f), { name: f });

// صور المعلومات (تتولد من tools/make_images.py)
const INFO = {
  rules: { file: 'rules.png', label: 'القوانين' },
  store: { file: 'policy_store.png', label: 'سياسة المتجر' },
  trade: { file: 'policy_trade.png', label: 'سياسة البيع والشراء' },
  refund: { file: 'policy_refund.png', label: 'الضمان والاسترجاع' },
  howto: { file: 'how_to_order.png', label: 'طريقة الطلب' },
  faq: { file: 'faq.png', label: 'الأسئلة الشائعة' },
  payment: { file: 'payment.png', label: 'طرق الدفع' },
  prices: { file: 'prices.png', label: 'الأسعار' },
};

async function sendLine(ch) {
  const u = S('line_image');
  return ch.send(u ? { content: u } : { files: [asset('line.png')] });
}

async function sendInfo(ch, key) {
  const i = INFO[key];
  if (!i) throw new Error('نوع غير معروف');
  await ch.send({ files: [asset(i.file)] });
  if (S('line_after_panels') === '1') await sendLine(ch);
}

module.exports = { asset, INFO, sendLine, sendInfo };
