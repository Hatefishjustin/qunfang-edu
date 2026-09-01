/**
 * 品牌配置 —— 换品牌只需要改这个文件。
 *
 * 修改 brandName 后，登录页、管理后台、排课中心、校区管理、教师端、
 * 家长/学生端、通用导航的全部品牌显示将自动更新，无需改动任何业务代码。
 */

/** 品牌/机构名称，显示在登录页与各端顶部导航 */
export const brandName = '群芳教育';

/** 品牌徽标字（显示在顶部圆角徽标中），默认取品牌名首字 */
export const brandMark = brandName.slice(0, 1);

/** 品牌标语，显示在登录页品牌名下方（可选，留空则不显示） */
export const brandSlogan = '';

/** 拼接 "品牌 · 模块名"（如 "群芳教育 · 教师端"）；无模块名时仅返回品牌名 */
export function brandTitle(module?: string): string {
  return module ? `${brandName} · ${module}` : brandName;
}
