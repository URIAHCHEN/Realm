// 宠物图片资源清单：用 glob 收集，缺图时自动回退到 CSS 版本，不会白屏。
// 文件命名见《宠物与时装-图片提示词.md》：
//   src/assets/pets/{pet}-s{0..3}.png
//   src/assets/pets/{pet}-face-{happy|thinking|celebrate}.png
//   src/assets/skins/{skin}.png

const petModules = import.meta.glob('../../assets/pets/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const skinModules = import.meta.glob('../../assets/skins/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function fileNameOf(path: string): string {
  return path.split('/').pop() ?? '';
}

const petMap = new Map<string, string>();
Object.entries(petModules).forEach(([path, url]) => {
  petMap.set(fileNameOf(path).replace(/\.png$/, ''), url);
});

const skinMap = new Map<string, string>();
Object.entries(skinModules).forEach(([path, url]) => {
  skinMap.set(fileNameOf(path).replace(/\.png$/, ''), url);
});

/** 基础形态图：{pet}-s{stage}；没有图时返回 undefined */
export function petStageImage(petId: string, stage: number): string | undefined {
  return petMap.get(`${petId}-s${stage}`);
}

/** 表情图（可选） */
export function petFaceImage(petId: string, face: 'happy' | 'thinking' | 'celebrate'): string | undefined {
  return petMap.get(`${petId}-face-${face}`);
}

/** 配饰层图：{skin}；没有图时返回 undefined，由调用方叠 CSS 版本 */
export function skinImage(skinId: string): string | undefined {
  return skinMap.get(skinId);
}

/** 是否已有任意宠物图片（用于决定是否启用图片渲染） */
export function hasPetImages(): boolean {
  return petMap.size > 0;
}
