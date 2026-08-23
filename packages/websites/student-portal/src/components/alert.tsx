import {
  AlertDescription,
  AlertTitle,
  Alert as ShadcnAlert,
} from '@lms/common-shadcn/components/ui/alert';
import React from 'react';

type AlertType = 'info' | 'error';

export interface AlertProps {
  type?: AlertType;
  header: React.ReactNode;
  children: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  header,
  children,
}) => {
  const variant = type === 'error' ? 'destructive' : 'default';
  const role = type === 'error' ? 'alert' : 'status';

  return (
    <ShadcnAlert variant={variant} role={role}>
      <AlertTitle>{header}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </ShadcnAlert>
  );
};
