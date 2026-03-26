import { create } from 'zustand';

export type VehicleType = 'motorcycle' | 'car' | 'bicycle';
export type VehicleColor = 'black' | 'white' | 'red' | 'blue' | 'gray' | 'other';

type SignupData = {
  fullName: string;
  email: string;
  phone: string;
  phoneVerified: boolean;
  vehicleType: VehicleType;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  plateNumber: string;
  vehicleColor: VehicleColor;
  driversLicenseUri: string | null;
  insuranceUri: string | null;
  platePhotoUri: string | null;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
};

export interface RiderSignupState extends SignupData {
  setPersonal: (data: { fullName: string; email: string; phone: string }) => void;
  setPhoneVerified: (v: boolean) => void;
  setVehicle: (data: Partial<Pick<SignupData,
    'vehicleType' | 'vehicleMake' | 'vehicleModel' | 'vehicleYear' | 'plateNumber' | 'vehicleColor'
  >>) => void;
  setDocument: (key: 'driversLicenseUri' | 'insuranceUri' | 'platePhotoUri', uri: string | null) => void;
  setBank: (data: { bankName: string; accountHolderName: string; accountNumber: string }) => void;
  reset: () => void;
}

const INITIAL: SignupData = {
  fullName: '',
  email: '',
  phone: '',
  phoneVerified: false,
  vehicleType: 'motorcycle',
  vehicleMake: '',
  vehicleModel: '',
  vehicleYear: '',
  plateNumber: '',
  vehicleColor: 'black',
  driversLicenseUri: null,
  insuranceUri: null,
  platePhotoUri: null,
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
};

export const useRiderSignupStore = create<RiderSignupState>((set) => ({
  ...INITIAL,
  setPersonal: (data) => set(data),
  setPhoneVerified: (v) => set({ phoneVerified: v }),
  setVehicle: (data) => set(data),
  setDocument: (key, uri) => set({ [key]: uri }),
  setBank: (data) => set(data),
  reset: () => set(INITIAL),
}));
