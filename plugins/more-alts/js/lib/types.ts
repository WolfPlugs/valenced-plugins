export interface Account {
	id: string
	username: string
	discriminator: string
	avatar: string | null
	displayName: string
	token: string
	addedAt: number
	isNative?: boolean
	isBot?: boolean
}

export interface MoreAltsStorage {
	accounts: Record<string, Account>
	accountOrder: string[]
	enableCLI: boolean
	confirmBeforeDelete: boolean
	enableUnsafeFeatures: boolean
	addToSidebar: boolean
	enableNativeSwitcher: boolean
	blockOtherAccountNotifications: boolean
	persistentStorageVault: boolean
	exportPasswordHash?: string
}

export const DEFAULT_STORAGE: MoreAltsStorage = {
	accounts: {},
	accountOrder: [],
	enableCLI: true,
	confirmBeforeDelete: true,
	enableUnsafeFeatures: false,
	addToSidebar: true,
	enableNativeSwitcher: true,
	blockOtherAccountNotifications: true,
	persistentStorageVault: true,
}
