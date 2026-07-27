import { Toaster as Sonner, type ToasterProps } from "sonner";
import type { ThemeColorSet } from "@/types";

type Props = ToasterProps & { colors: ThemeColorSet };

const Toaster = ({ colors, ...props }: Props) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": colors.menuBackground,
          "--normal-text": colors.cssVars["--foreground"],
          "--normal-border": colors.menuBorderColor,
          "--border-radius": "0.625rem",
        } as React.CSSProperties
      }
      toastOptions={{
        style: {
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
