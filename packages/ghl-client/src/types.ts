export interface GhlCredentials {
  locationId: string;
  apiToken: string;
}

export interface GhlContact {
  id: string;
  phone?: string;
  email?: string;
  customFields?: Record<string, unknown>;
}

export interface GhlMessagePayload {
  type: 'WhatsApp' | 'SMS' | 'Email' | 'Custom';
  contactId: string;
  message: string;
}
