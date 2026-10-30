// 宠物图片资源清单：用 glob 收集，缺图自动回退到 CSS 版本，不会白屏。
//
// 推荐资产（脚本生成，见 scripts/optimize-images.mjs）：
//   src/assets/pets/{pet}-s{0..3}-{128|256}.webp
//   src/assets/pets/{pet}-face-{happy|thinking|celebrate}-{128|256}.webp
//   src/assets/skins/{skin}-{128|256}.webp
// 兼容：也认原始 PNG（{pet}-s0.png / {skin}.png），但会显著增大包体。

type Sources = { small?: string; large?: string };

// 只收 128/256 两档：512 及以上不进包，需要用（如分享海报）时单独按需加载
const petWebp = import.meta.glob(['../../assets/pets/*-128.webp', '../../assets/pets/*-256.webp'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const petPng = import.meta.glob('../../assets/pets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const skinWebp = import.meta.glob(['../../assets/skins/*-128.webp', '../../assets/skins/*-256.webp'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const skinPng = import.meta.glob('../../assets/skins/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const fileNameOf = (path: string) => path.split('/').pop() ?? '';

function collect(modules: Record<string, string>, suffixPattern: RegExp): Map<string, Sources> {
  const map = new Map<string, Sources>();
  Object.entries(modules).forEach(([path, url]) => {
    const file = fileNameOf(path);
    const match = file.match(suffixPattern);
    if (!match) return;
    const key = match[1];
    const size = Number(match[2]);
    const entry = map.get(key) ?? {};
    if (size >= 256) entry.large = url;
    else entry.small = url;
    map.set(key, entry);
  });
  return map;
}

// 匹配 foo-128.webp / foo-256.webp
const petSized = collect(petWebp, /^(.+)-(\d+)\.webp$/);
const skinSized = collect(skinWebp, /^(.+)-(\d+)\.webp$/);
// 穿戴成品图：{skin}-worn-{pet}-{size}.webp
const wornSized = collect(skinWebp, /^(.+-worn-.+)-(\d+)\.webp$/);

// 未分档的原始图（png/webp）作为兜底
const petFull = new Map<string, string>();
Object.entries(petPng).forEach(([path, url]) => petFull.set(fileNameOf(path).replace(/\.png$/, ''), url));
Object.entries(petWebp).forEach(([path, url]) => {
  const key = fileNameOf(path).replace(/\.webp$/, '');
  if (!/-\d+$/.test(key)) petFull.set(key, url);
});
const skinFull = new Map<string, string>();
Object.entries(skinPng).forEach(([path, url]) => skinFull.set(fileNameOf(path).replace(/\.png$/, ''), url));
Object.entries(skinWebp).forEach(([path, url]) => {
  const key = fileNameOf(path).replace(/\.webp$/, '');
  if (!/-\d+$/.test(key)) skinFull.set(key, url);
});

/** 基础形态图（{pet}-s{stage}）：优先 256，其次 128，最后原始图 */
export function petStageSources(petId: string, stage: number): Sources {
  const key = `${petId}-s${stage}`;
  const sized = petSized.get(key);
  if (sized) return sized;
  const full = petFull.get(key);
  return full ? { large: full, small: full } : {};
}

/** 表情图（可选） */
export function petFaceSources(petId: string, face: 'happy' | 'thinking' | 'celebrate'): Sources {
  const key = `${petId}-face-${face}`;
  const sized = petSized.get(key);
  if (sized) return sized;
  const full = petFull.get(key);
  return full ? { large: full, small: full } : {};
}

/** 配饰层图（{skin}） */
export function skinSources(skinId: string): Sources {
  const sized = skinSized.get(skinId);
  if (sized) return sized;
  const full = skinFull.get(skinId);
  return full ? { large: full, small: full } : {};
}

/** 是否已有任意宠物图片 */
export function hasPetImages(): boolean {
  return petSized.size > 0 || petFull.size > 0;
}

/** 是否存在分档图（用于决定是否输出 srcSet） */
export function hasSizedAssets(): boolean {
  return petSized.size > 0 || skinSized.size > 0;
}


/** 穿戴成品图（{skin}-worn-{pet}）：素材只对已提供的宠物有效，其余返回空 */
export function wornSources(skinId: string, petId: string): Sources {
  const sized = wornSized.get(`${skinId}-worn-${petId}`);
  if (sized) return sized;
  const full = skinFull.get(`${skinId}-worn-${petId}`);
  return full ? { large: full, small: full } : {};
}

/** 该宠物是否有这款配饰的穿戴成品图 */
export function hasWornImage(skinId: string, petId: string): boolean {
  const src = wornSources(skinId, petId);
  return Boolean(src.large || src.small);
}
