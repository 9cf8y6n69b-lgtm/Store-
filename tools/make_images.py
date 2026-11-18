# توليد صور القوانين والسياسات من ملف المحتوى (يُدار من الداشبورد ← 📝 القوانين والسياسات).
# الاستخدام:
#   python3 tools/make_images.py                      ← يولّد كل الصور من tools/default_content.json داخل assets/
#   python3 tools/make_images.py --content data/content.json --out data/generated [--only rules,faq]
#   python3 tools/make_images.py --dump               ← يطبع المحتوى الافتراضي
# يحتاج: pip install pillow  (مع دعم raqm للعربي)
import os, sys, json, random, argparse
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')
OUT = ASSETS
FONT = os.path.join(ASSETS, 'fonts', 'font-bold.ttf')
W, M, PAD, BADGE = 1600, 70, 56, 72

def F(sz): return ImageFont.truetype(FONT, sz)
def tw(t, f): return f.getlength(t, direction='rtl', language='ar')

def wrap(text, f, maxw):
    lines, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if tw(t, f) <= maxw or not cur: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def rtl(d, x_right, y, t, f, fill):
    d.text((x_right - tw(t, f), y), t, font=f, fill=fill, direction='rtl', language='ar')

def center(d, y, t, f, fill, rtl_text=True):
    w = tw(t, f) if rtl_text else f.getlength(t)
    if rtl_text: d.text(((W - w) / 2, y), t, font=f, fill=fill, direction='rtl', language='ar')
    else: d.text(((W - w) / 2, y), t, font=f, fill=fill)

def diamond_line(d, y):
    d.line([(M + 120, y), (W / 2 - 40, y)], fill=(167, 139, 250, 200), width=3)
    d.line([(W / 2 + 40, y), (W - M - 120, y)], fill=(167, 139, 250, 200), width=3)
    d.polygon([(W / 2, y - 16), (W / 2 + 16, y), (W / 2, y + 16), (W / 2 - 16, y)], fill=(236, 170, 255, 255))

def build(name, title, sub, items, footer):
    body, head = F(40), F(44)
    right = W - M - PAD
    text_r = right - BADGE - 34
    maxw = text_r - (M + PAD)
    rows = []
    for it in items:
        h, t = it
        hl = wrap(h, head, maxw) if h else []
        tl = wrap(t, body, maxw) if t else []
        hgt = max(len(hl) * 60 + len(tl) * 54 + (6 if hl and tl else 0), BADGE)
        rows.append((hl, tl, hgt))
    gap = 46
    top = 470
    card_h = PAD * 2 + sum(r[2] for r in rows) + gap * (len(rows) - 1)
    H = top + card_h + 230

    bg = Image.open(os.path.join(ASSETS, 'bg.png')).convert('RGB')
    s = max(W / bg.width, H / bg.height)
    bg = bg.resize((int(bg.width * s) + 1, int(bg.height * s) + 1), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
    bg = bg.crop((0, 0, W, H)).convert('RGBA')
    bg = Image.alpha_composite(bg, Image.new('RGBA', (W, H), (8, 4, 22, 150)))
    rnd = random.Random(7)
    sd = ImageDraw.Draw(bg)
    for _ in range(140):
        x, y, r = rnd.randint(0, W), rnd.randint(0, H), rnd.choice([1, 1, 2, 2, 3])
        a = rnd.randint(90, 230)
        sd.ellipse([x, y, x + r, y + r], fill=(235, 225, 255, a))

    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([M, top, W - M, top + card_h], radius=44, fill=(20, 9, 48, 218), outline=(167, 139, 250, 255), width=3)

    nova = F(34)
    label = 'N O V A   S T O R E'
    center(d, 56, label, nova, (232, 214, 255, 255), rtl_text=False)
    center(d, 120, title, F(112), (255, 255, 255, 255))
    center(d, 282, sub, F(44), (196, 160, 255, 255), rtl_text=False)
    diamond_line(d, 380)

    y = top + PAD
    for n, (hl, tl, hgt) in enumerate(rows, 1):
        cy = y + BADGE / 2
        d.ellipse([right - BADGE, y, right, y + BADGE], fill=(155, 107, 255, 255), outline=(236, 200, 255, 255), width=3)
        d.text((right - BADGE / 2, cy), str(n), font=F(42), fill=(255, 255, 255, 255), anchor='mm')
        ty = y
        for l in hl:
            rtl(d, text_r, ty, l, head, (216, 188, 255, 255)); ty += 60
        if hl and tl: ty += 6
        for l in tl:
            rtl(d, text_r, ty, l, body, (238, 232, 252, 255)); ty += 54
        y += hgt
        if n < len(rows):
            ly = y + gap / 2
            d.line([(M + PAD, ly), (W - M - PAD, ly)], fill=(167, 139, 250, 70), width=2)
            y += gap

    fy = top + card_h + 56
    fw = tw(footer, F(38)) + 90
    d.rounded_rectangle([(W - fw) / 2, fy, (W + fw) / 2, fy + 84], radius=42, fill=(155, 107, 255, 235))
    center(d, fy + 16, footer, F(38), (255, 255, 255, 255))
    center(d, fy + 112, 'Nova Store  •  Discord Bots', F(28), (190, 165, 240, 255), rtl_text=False)

    out = Image.alpha_composite(bg, layer).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    out.save(os.path.join(OUT, name), optimize=True)
    print('saved', name, out.size)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--content'); ap.add_argument('--out'); ap.add_argument('--only'); ap.add_argument('--dump', action='store_true')
    a = ap.parse_args()
    default_path = os.path.join(HERE, 'default_content.json')
    data = json.load(open(default_path, encoding='utf-8'))
    if a.dump:
        print(json.dumps(data, ensure_ascii=False, indent=1)); sys.exit(0)
    if a.content and os.path.exists(a.content):
        data.update(json.load(open(a.content, encoding='utf-8')))
    if a.out: OUT = os.path.abspath(a.out)
    only = set(a.only.split(',')) if a.only else None
    for key, c in data.items():
        if only and key not in only: continue
        build(c['file'], c['title'], c['sub'], [(i['h'], i['t']) for i in c['items']], c['footer'])
# تم صنع البوت بمتجر نوفا ستور • يوزر الاونر: .5yb.
