// 这个 Tooltip 组件本质上是一个“包裹器”：它把任意子元素包起来，在合适的交互时机（鼠标悬停、键盘聚焦等）显示一段提示文字，并自动避免贴边溢出。

import { useTooltip } from "@/providers/TooltipProvider";
import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type TooltipProps = {
  children: React.ReactNode; // 被包裹的类型，比如一个小按钮
  className?: string; // 外部可以传入样式
  content: string;
  id?: number | string; // 用于区分多个内容相同的tooltip
};

export const Tooltip = ({ children, className, content, id }: TooltipProps) => {
  const { activeTooltip, showTooltip, hideTooltip } = useTooltip(); // 从 TooltipProvider 拿到全局 tooltip 状态与控制方法
  const [positionX, setPositionX] = useState<"center" | "left" | "right">(
    "center"
  ); // 组件的水平定位，可以有尖括号里的三种类型
  const [positionY, setPositionY] = useState<"top" | "bottom">("top");
  const [isHoverAvailable, setIsHoverAvailable] = useState(false); // if hover state exists
  const [isPointer, setIsPointer] = useState(false); // if user is using a pointer device

  const tooltipRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsHoverAvailable(window.matchMedia("(hover: hover)").matches); // check if hover state is available
  }, []);

  const tooltipIdentifier = id ? id + content : content;
  const tooltipId = `tooltip-${id || content.replace(/\s+/g, "-")}`; // used for ARIA

  const isVisible = activeTooltip === tooltipIdentifier;

  // detect collision once the tooltip is visible
  useLayoutEffect(() => {
    const detectCollision = () => {
      const ref = tooltipRef.current;

      if (ref) {
        const tooltipRect = ref.getBoundingClientRect();
        const { top, left, bottom, right } = tooltipRect;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (top <= 0) setPositionY("bottom");
        if (left <= 0) setPositionX("left");
        if (bottom >= viewportHeight) setPositionY("top");
        if (right >= viewportWidth) setPositionX("right");
      }
    };

    if (!isVisible) {
      setPositionX("center");
      setPositionY("top");
    } else {
      detectCollision();
    }
  }, [isVisible]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it's fine, but todo fix
    <div
      aria-describedby={isVisible ? tooltipId : undefined}
      className={cn("relative inline-block", className)}
      onMouseEnter={() =>
        isHoverAvailable && showTooltip(tooltipIdentifier, false)
      }
      onMouseLeave={() => hideTooltip()}
      onPointerDown={(e: React.PointerEvent) => {
        if (e.pointerType === "mouse") {
          setIsPointer(true);
        }
      }}
      onPointerUp={() => setIsPointer(false)}
      onFocus={() => {
        // only allow tooltips when hover state is available
        if (isHoverAvailable) {
          isPointer // if user clicks with a mouse, do not auto-populate tooltip
            ? showTooltip(tooltipIdentifier, false)
            : showTooltip(tooltipIdentifier, true);
        } else {
          hideTooltip();
        }
      }}
      onBlur={() => hideTooltip()}
    >
      {children}
      {isVisible && (
        <span
          aria-hidden={!isVisible}
          className={cn(
            "bg-ob-base-1000 text-ob-inverted absolute w-max rounded-md px-2 py-1 text-sm shadow before:absolute before:top-0 before:left-0 before:size-full before:scale-[1.5] before:bg-transparent",
            {
              "left-0 translate-x-0": positionX === "left",
              "right-0 translate-x-0": positionX === "right",
              "left-1/2 -translate-x-1/2": positionX === "center",
              "-bottom-7": positionY === "bottom",
              "-top-7": positionY === "top"
            }
          )}
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </div>
  );
};
