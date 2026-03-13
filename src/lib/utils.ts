import { clsx, type ClassValue } from "clsx"; //从 clsx 库里导入 clsx 函数和 ClassValue 类型
// clsx：把各种形式的 class 输入（字符串、数组、对象、条件表达式）整理成一个 class 字符串
// type ClassValue：TypeScript 类型，约束 cn 函数参数可以接收哪些 class 形式
import { twMerge } from "tailwind-merge";
// twmerge作用是处理 Tailwind 冲突类，例如 p-2 p-4 最后保留更后面的 p-4，防止无效/重复 class

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
