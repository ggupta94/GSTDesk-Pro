export const ROLES = {
  CA: "CA",
  ARTICLE: "ARTICLE",
  STAFF: "STAFF",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  CA: "Chartered Accountant",
  ARTICLE: "Article Assistant",
  STAFF: "Office Staff",
};

export const FILING_FREQ = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
} as const;
export type FilingFrequency = (typeof FILING_FREQ)[keyof typeof FILING_FREQ];

export const REGISTRATION_TYPES = [
  "REGULAR",
  "COMPOSITION",
  "SEZ",
  "CASUAL",
  "ISD",
  "TDS",
  "TCS",
  "NRTP",
] as const;
export type RegistrationType = (typeof REGISTRATION_TYPES)[number];

export const RETURN_TYPES = ["GSTR1", "GSTR3B", "GSTR9", "GSTR2B"] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_STATUS = ["PENDING", "FILED", "OVERDUE"] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];

export const ITC_ELIGIBILITY = [
  "FULLY_ELIGIBLE",
  "PARTIALLY_BLOCKED",
  "BLOCKED",
] as const;
export type ITCEligibility = (typeof ITC_ELIGIBILITY)[number];

export const SUPPLY_TYPES = ["INTRA_STATE", "INTER_STATE"] as const;
export type SupplyType = (typeof SUPPLY_TYPES)[number];

export const GST_RATES = [0, 0.1, 0.25, 3, 5, 12, 18, 28] as const;

// Permissions matrix
export const PERMISSIONS = {
  CA:      { read: true, write: true,  delete: true,  manageUsers: true,  viewItc: true, viewCredentials: true,  editCredentials: true  },
  ARTICLE: { read: true, write: true,  delete: false, manageUsers: false, viewItc: true, viewCredentials: true,  editCredentials: false },
  STAFF:   { read: true, write: false, delete: false, manageUsers: false, viewItc: true, viewCredentials: false, editCredentials: false },
} as const;

export function can(role: Role | undefined | null, action: keyof (typeof PERMISSIONS)["CA"]) {
  if (!role) return false;
  return PERMISSIONS[role][action];
}
