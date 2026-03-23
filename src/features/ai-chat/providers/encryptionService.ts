/**
 * API Key 加密存储服务。
 * 使用 Web Crypto API (AES-GCM) 加密，适用于浏览器和 Electron 环境。
 * 密钥材料基于设备指纹派生，每台设备唯一。
 */

const ENC_PREFIX = "enc_";
const STATIC_PEPPER = "obsidian-ai-chat-v2";

let cryptoKey: CryptoKey | null = null;

/** 收集设备指纹作为密钥材料的一部分 */
function getDeviceFingerprint(): string {
	const parts: string[] = [STATIC_PEPPER];
	if (typeof navigator !== "undefined") {
		parts.push(navigator.userAgent);
		parts.push(navigator.language);
		parts.push(String(navigator.hardwareConcurrency || 0));
	}
	if (typeof screen !== "undefined") {
		parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
	}
	return parts.join("|");
}

async function getCryptoKey(): Promise<CryptoKey> {
	if (cryptoKey) return cryptoKey;

	const encoder = new TextEncoder();
	const fingerprint = getDeviceFingerprint();
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(fingerprint),
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);

	cryptoKey = await crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: encoder.encode("ai-chat-device-salt"),
			iterations: 100000,
			hash: "SHA-256",
		},
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);

	return cryptoKey;
}

export async function encryptKey(plainText: string): Promise<string> {
	if (!plainText || plainText.startsWith(ENC_PREFIX)) return plainText;

	try {
		const key = await getCryptoKey();
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoded = new TextEncoder().encode(plainText);

		const encrypted = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			encoded,
		);

		// Combine IV + ciphertext, encode as base64
		const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
		combined.set(iv);
		combined.set(new Uint8Array(encrypted), iv.length);

		return ENC_PREFIX + btoa(String.fromCharCode(...combined));
	} catch {
		// If encryption fails, return plain text
		return plainText;
	}
}

export async function decryptKey(encryptedText: string): Promise<string> {
	if (!encryptedText || !encryptedText.startsWith(ENC_PREFIX)) return encryptedText;

	try {
		const key = await getCryptoKey();
		const data = atob(encryptedText.slice(ENC_PREFIX.length));
		const bytes = new Uint8Array(data.length);
		for (let i = 0; i < data.length; i++) {
			bytes[i] = data.charCodeAt(i);
		}

		const iv = bytes.slice(0, 12);
		const ciphertext = bytes.slice(12);

		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			ciphertext,
		);

		return new TextDecoder().decode(decrypted);
	} catch {
		// If decryption fails, return as-is (might be plain text)
		return encryptedText;
	}
}

/** 检查一个值是否已加密 */
export function isEncrypted(value: string): boolean {
	return value.startsWith(ENC_PREFIX);
}
