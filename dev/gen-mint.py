#!/usr/bin/env python3
"""يولّد mint-gen.css: نسخة فاتحة (أبيض + أخضر غامق + ليموني) من كل قواعد الألوان بالتطبيق.
كل قاعدة فيها لون تنكتب من جديد تحت html[data-ui=mint] بلون محوّل حسب نوع الخاصية،
فالواجهة الأصلية ما تتغير أبد، والفاتحة تغطي كل الأقسام بدون ما نعيد كتابة كل ملف.
التشغيل: python3 dev/gen-mint.py  (يعيد التوليد بعد أي تعديل على ملفات الستايل)"""
import re, colorsys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ['styles.css', 'ui2.css', 'lux.css', 'journey.css', 'ai2.css', 'themes.css', 'v2.css', 'v3.css', 'motion.css', 'v4.css', 'hallmark.css', 'pro.css', 'ci.css']
INK = (20, 38, 28)        # نص أساسي
DEEP = (23, 61, 43)       # أخضر غامق (للظلال والخطوط)
TXT_PROPS = {'color', '-webkit-text-fill-color', 'caret-color', 'text-decoration-color', 'fill', 'stroke', 'column-rule-color'}

COL = re.compile(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]*\)|\b(?:white|black)\b')

def parse(c):
    c = c.strip()
    if c == 'white': return (255, 255, 255, 1)
    if c == 'black': return (0, 0, 0, 1)
    if c.startswith('#'):
        h = c[1:]
        if len(h) in (3, 4): h = ''.join(x * 2 for x in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
        return (r, g, b, a)
    inner = c[c.index('(') + 1:-1]
    if 'var(' in inner: return None
    parts = re.split(r'[\s,/]+', inner.strip())
    try:
        nums = [float(p[:-1]) * 2.55 if p.endswith('%') and i < 3 else (float(p[:-1]) / 100 if p.endswith('%') else float(p)) for i, p in enumerate(parts)]
    except ValueError:
        return None
    if len(nums) < 3: return None
    return (nums[0], nums[1], nums[2], nums[3] if len(nums) > 3 else 1)

def fmt(r, g, b, a):
    r, g, b = (max(0, min(255, round(v))) for v in (r, g, b))
    a = max(0, min(1, a))
    return f'#{r:02x}{g:02x}{b:02x}' if a >= 0.999 else f'rgba({r},{g},{b},{round(a, 3)})'

def hls(r, g, b): return colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
def rgb(h, l, s): r, g, b = colorsys.hls_to_rgb(h, max(0, min(1, l)), max(0, min(1, s))); return (r * 255, g * 255, b * 255)

def t_text(c):
    r, g, b, a = c; h, l, s = hls(r, g, b)
    if l >= 0.9: return fmt(*INK, a)                       # أبيض ← حبر غامق
    if s < 0.25:
        if l <= 0.22: return fmt(r, g, b, a)                # نص غامق فوق لون فاتح: يبقى
        return fmt(*rgb(0.38, max(0.16, min(0.5, 1 - l * 0.85)), 0.1), a)  # رمادي ← رمادي غامق مخضّر
    if l >= 0.5: return fmt(*rgb(h, 0.36 if l > 0.62 else 0.4, min(1, s * 0.9)), a)  # ألوان زاهية ← أغمق حتى تنقرى
    return fmt(r, g, b, a)

def t_surf(c, bg=False):
    r, g, b, a = c; h, l, s = hls(r, g, b)
    if bg and l <= 0.16 and a < 1 and a >= 0.3: return fmt(255, 255, 255, min(0.92, a + 0.1))   # زجاج غامق ← زجاج أبيض
    if l >= 0.9: return fmt(*DEEP, max(0.03, a * 0.85)) if a < 1 else fmt(r, g, b, a)   # أبيض شفاف ← تظليل أخضر
    if l <= 0.12 and s < 0.3 and a < 1: return fmt(*DEEP, a * 0.32)                          # ظل أسود ← ظل أخضر خفيف
    if l < 0.32:
        if s < 0.35: return fmt(*rgb(0.36, 1 - l * 0.42, 0.18), a)                         # سطح غامق ← سطح فاتح
        return fmt(*rgb(h, 0.93, s * 0.45), a)                                             # غامق ملوّن ← فاتح ملوّن
    if s < 0.2: return fmt(*rgb(0.36, max(0.55, 1 - l * 0.5), 0.12), a)                     # رمادي متوسط ← خط فاتح
    return fmt(r, g, b, a)

def t_shadow(c):
    r, g, b, a = c; h, l, s = hls(r, g, b)
    if l <= 0.15: return fmt(*DEEP, a * 0.3)
    if l >= 0.9: return fmt(*DEEP, a * 0.15)
    return fmt(r, g, b, a * 0.6)

def conv(prop, val):
    p = prop.strip().lower()
    fn = t_text if p in TXT_PROPS else t_shadow if p in ('box-shadow', 'text-shadow', 'filter') else (lambda c: t_surf(c, p.startswith('background'))) 
    def rep(m):
        c = parse(m.group(0)); return m.group(0) if c is None else fn(c)
    return COL.sub(rep, val)

COLP = re.compile(r'^(color|background(-color|-image)?|border(-(top|right|bottom|left|inline|block)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|-webkit-text-fill-color|caret-color|text-decoration-color)$')
def is_col(p): return bool(COLP.match(p.strip().lower()))

def scope(sel):
    out = []
    for s in split_top(sel, ','):
        s = s.strip()
        if not s: continue
        if s.startswith(':root'): out.append('html[data-ui=mint]' + s[5:])
        elif re.match(r'html(?![\w-])', s): out.append('html[data-ui=mint]' + s[4:])
        else: out.append('html[data-ui=mint] ' + s)
    return ','.join(out)

def split_top(s, ch):
    parts, d, cur = [], 0, ''
    for x in s:
        if x in '([': d += 1
        elif x in ')]': d -= 1
        if x == ch and d == 0: parts.append(cur); cur = ''
        else: cur += x
    parts.append(cur); return parts

def strip_comments(t): return re.sub(r'/\*.*?\*/', '', t, flags=re.S)

def blocks(t):
    """يرجع [(prelude, body)] على المستوى الأعلى مع احترام الأقواس المتداخلة"""
    i, n, out = 0, len(t), []
    while i < n:
        j = t.find('{', i)
        if j < 0: break
        pre = t[i:j].strip(); d, k = 1, j + 1
        while k < n and d:
            if t[k] == '{': d += 1
            elif t[k] == '}': d -= 1
            k += 1
        out.append((pre.split(';')[-1].strip(), t[j + 1:k - 1])); i = k
    return out

def decls(body):
    res = []
    for d in split_top(body, ';'):
        if ':' not in d: continue
        prop, val = d.split(':', 1)
        prop = prop.strip()
        if not prop or prop.startswith('--'): continue
        lit = COL.search(val)
        # قواعد الألوان المبنية على متغيرات تنعاد كتابتها كما هي، حتى يبقى ترتيب التتالي نفسه
        # (وإلا القاعدة الأساسية المولّدة تغلب حالات مثل .up و .on الأصلية)
        if not lit and not ('var(' in val and is_col(prop)): continue
        nv = conv(prop, val) if lit else val
        if lit and nv == val and not ('var(' in val and is_col(prop)): continue
        res.append(f'{prop}:{nv.strip()}')
    # الـ background المختصر يرجّع الـ clip والحجم والموضع للافتراضي، فنعيد كتابتها (النص المتدرّج وحركات اللمعان)
    if any(r.split(':', 1)[0].strip().lower() == 'background' for r in res):
        for d in split_top(body, ';'):
            if ':' in d and d.split(':', 1)[0].strip().lower() in ('background-clip', '-webkit-background-clip', 'background-size', 'background-position', 'background-repeat', 'background-origin', 'background-attachment', 'background-blend-mode'): res.append(d.strip())
    return res

def walk(t):
    out = []
    for pre, body in blocks(t):
        if pre.startswith('@media') or pre.startswith('@supports') or pre.startswith('@container'):
            inner = walk(body)
            if inner: out.append(f'{pre}{{{inner}}}')
        elif pre.startswith('@'):
            continue  # keyframes / font-face
        else:
            ds = decls(body)
            if ds: out.append(f'{scope(pre)}{{{";".join(ds)}}}')
    return '\n'.join(out)

parts = ['/* مولّد تلقائياً من dev/gen-mint.py — لا تعدّله يدوياً. الواجهة الفاتحة «زمرّد» */']
for f in FILES:
    src = strip_comments((ROOT / f).read_text())
    g = walk(src)
    if g: parts.append(f'/* ← {f} */\n{g}')
(ROOT / 'mint-gen.css').write_text('\n'.join(parts) + '\n')
print('ok', sum(len(p) for p in parts))
