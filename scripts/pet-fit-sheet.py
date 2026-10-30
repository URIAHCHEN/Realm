#!/usr/bin/env python3
"""配饰落位校准：按 fit 表把配饰叠到宠物上，输出对照图（仅开发用）。

用法：python3 scripts/pet-fit-sheet.py [skin] [stage]
  skin   逗号分隔，默认全部 8 款
  stage  0-3 或 all，默认 all

读：src/lib/gamification/petFit.ts 里的 PET_FIT / SKIN_RULES（用正则抠 JSON 段，
    脚本不引入 TS 依赖；改完表直接重跑即可看到效果）
写：/tmp/petcal/fit-<skin>.png
"""
from PIL import Image
import sys, json, re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANVAS = 1024
THR = 24

def alpha_bbox(im):
    return im.split()[3].point(lambda v: 255 if v > THR else 0).getbbox()

def loose_json(text):
    # TS 对象字面量 → JSON：去掉行注释，给裸键名加引号
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    text = re.sub(r'//[^\n]*', '', text)
    text = re.sub(r'([{,{]\s*)([A-Za-z_$][\w$]*)\s*:', r'\1"\2":', text)
    text = re.sub(r',(\s*[}\]])', r'\1', text)
    return json.loads(text)

def load_rules():
    src = open(os.path.join(ROOT, 'src/lib/gamification/petFit.ts'), encoding='utf-8').read()
    fit = loose_json(re.search(r'export const PET_FIT[^=]*=\s*(\{.*?\n\});', src, re.S).group(1))
    rules = loose_json(re.search(r'export const SKIN_RULES[^=]*=\s*(\{.*?\n\});', src, re.S).group(1))
    try:
        tweak = loose_json(re.search(r'export const PET_SKIN_TWEAK[^=]*=\s*(\{.*?\n\});', src, re.S).group(1))
    except Exception:
        tweak = {}
    return fit, rules, tweak

def place(pet_img, skin_id, rule, head):
    """把配饰按规则放到宠物图上；head = {cx, cy, w}（1024 坐标）"""
    skin = Image.open(os.path.join(ROOT, f'raw-assets/skins/{skin_id}.png')).convert('RGBA')
    cb = alpha_bbox(skin)
    crop = skin.crop(cb)
    cw, ch = crop.size

    target_w = head['w'] * rule['w']
    scale = target_w / cw
    target_h = ch * scale
    if 'h' in rule:                       # 允许单独约束高度（如咸鱼、恐龙服）
        target_h = head['w'] * rule['h']
        scale = target_h / ch
        target_w = cw * scale

    left = head['cx'] + head['w'] * rule.get('dx', 0) - target_w / 2
    top = head['cy'] + head['w'] * rule.get('dy', 0) - target_h * rule.get('anchor', 0.5)

    out = pet_img.copy()
    layer = crop.resize((max(1, int(target_w)), max(1, int(target_h))), Image.LANCZOS)
    out.alpha_composite(layer, (int(left), int(top)))
    return out

def main():
    skins = sys.argv[1].split(',') if len(sys.argv) > 1 else ['noodle','melon','doge','shades','fish','drumstick','helmet','dino']
    stages = [int(sys.argv[2])] if len(sys.argv) > 2 and sys.argv[2] != 'all' else [0,1,2,3]
    fit, rules, tweaks = load_rules()
    pets = ['moss','ember','ink','thunder','otter','dream']
    cell = 200
    os.makedirs('/tmp/petcal', exist_ok=True)
    for skin in skins:
        rule = dict(rules[skin])
        combos = [(pet, st) for pet in pets for st in stages]
        cols = 4 if len(stages) > 1 else 3
        rows = (len(combos) + cols - 1) // cols
        sheet = Image.new('RGB', (cell*cols, cell*rows), (248,248,248))
        for i, (pet, st) in enumerate(combos):
            t = tweaks.get(f'{pet}-{skin}', {})
            pet_rule = dict(rule)
            pet_rule['dx'] = rule.get('dx', 0) + t.get('dx', 0)
            pet_rule['dy'] = rule.get('dy', 0) + t.get('dy', 0)
            if t.get('s') and rule.get('w'):
                pet_rule['w'] = rule['w'] * t['s']
            pet_img = Image.open(os.path.join(ROOT, f'raw-assets/pets/{pet}-s{st}.png')).convert('RGBA')
            if rule.get('z') == 'behind':
                composed = Image.alpha_composite(place(Image.new('RGBA', pet_img.size, (0,0,0,0)), skin, pet_rule, fit[pet][st]), pet_img)
            else:
                composed = place(pet_img, skin, pet_rule, fit[pet][st])
            composed.thumbnail((cell-6, cell-6), Image.LANCZOS)
            tile = Image.new('RGB', (cell, cell), (248,248,248))
            tile.paste(composed.convert('RGB'), ((cell-composed.size[0])//2, (cell-composed.size[1])//2), composed)
            sheet.paste(tile, ((i % cols)*cell, (i // cols)*cell))
        sheet.save(f'/tmp/petcal/fit-{skin}.png')
        print('wrote', f'/tmp/petcal/fit-{skin}.png')

if __name__ == '__main__':
    main()
