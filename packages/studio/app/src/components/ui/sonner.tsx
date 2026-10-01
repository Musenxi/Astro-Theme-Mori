import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{ classNames: { toast: '!rounded-xl !border-0 !bg-popover !text-popover-foreground !shadow-pop !font-sans !text-13' } }}
      {...props}
    />
  );
}

export { Toaster };
