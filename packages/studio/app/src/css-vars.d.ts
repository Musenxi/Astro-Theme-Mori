import 'react';

// 行内样式里只传 CSS 自定义属性（--x: 值），样式写在类名里（left-(--x) 之类）
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
