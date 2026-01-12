
export enum MessageBusType {
  CONFIRMATION = 'confirmation',
}

export interface ToolConfirmationRequest {
  id: string;
  type: string;
  toolName: string;
  params: any;
  details?: any;
}

export interface ToolConfirmationResponse {
  id: string;
  approved: boolean;
  modifiedParams?: any;
}
