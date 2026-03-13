import { cn } from "@/lib/utils";

type CardProps = {
  as?: React.ElementType;
  children?: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLElement>;
  tabIndex?: number;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
};

export const Card = ({
  as,
  children,
  className,
  ref,
  tabIndex,
  variant = "secondary"
}: CardProps) => {
  const Component = as ?? "div";
  return (
    <Component
      className={cn(
        "w-full rounded-lg p-4",
        // 撑满母盒子；四角圆角large；字体第四级
        {
          // 这玩意冒号后面的会变成true或者false，被cn拼起来后false的不渲染
          "btn-primary": variant === "primary",
          "btn-secondary": variant === "secondary"
        },
        className
      )}
      ref={ref}
      tabIndex={tabIndex}
    >
      {children}
    </Component>
  );
};
