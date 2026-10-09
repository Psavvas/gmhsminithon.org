import { createDonorDriveClient } from "./donorDrive";
import { getDonorDriveCacheStore } from "./content/donorDriveCache";

export const getDonorDriveTotal = createDonorDriveClient(
  fetch,
  Date.now,
  getDonorDriveCacheStore,
);
