import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      expand={true}
      richColors
      closeButton
      duration={4000}
      gap={8}
      visibleToasts={3}
      // @ts-ignore — sonner supports swipeThreshold but types may lag
      swipeThreshold={50}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-xl group-[.toaster]:rounded-2xl group-[.toaster]:backdrop-blur-sm group-[.toaster]:animate-toast-slide-in",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-xl group-[.toast]:font-medium",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-xl",
          closeButton: "group-[.toast]:bg-muted/80 group-[.toast]:border-border/40 group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!bg-primary/10 group-[.toaster]:!border-primary/30 group-[.toaster]:!text-foreground",
          error: "group-[.toaster]:!bg-destructive/10 group-[.toaster]:!border-destructive/30 group-[.toaster]:!text-foreground",
          info: "group-[.toaster]:!bg-blue-50 group-[.toaster]:!border-blue-200 group-[.toaster]:!text-foreground",
          warning: "group-[.toaster]:!bg-amber-50 group-[.toaster]:!border-amber-200 group-[.toaster]:!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
