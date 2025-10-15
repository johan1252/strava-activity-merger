import { API_BASE_URL } from '../config';

const checkAndRefreshToken = async () => {
    const token = localStorage.getItem('token');
    if (!token) return null;

    const parsedToken = JSON.parse(token);
    const currentTime = Math.floor(Date.now() / 1000);

    // Refresh if token is expired or will expire in next 5 minutes
    if (parsedToken.expiresAt <= currentTime + 300) {
        console.debug("Token expired or expiring soon, refreshing...");
        try {
            const response = await fetch(`${API_BASE_URL}/refresh-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken: parsedToken.refreshToken }),
            });

            const data = await response.json();
            if (!data.accessToken) throw new Error('No access token in response');

            const tokenInfo = {
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                expiresAt: data.expiresAt,
                tokenType: data.tokenType,
                expiresIn: data.expiresIn,
            };
            localStorage.setItem('token', JSON.stringify(tokenInfo));
            return tokenInfo;
        } catch (error) {
            console.error('Error refreshing token:', error);
            return null;
        }
    }

    return parsedToken;
};

export const fetchWithAuth = async (endpoint: string, options: RequestInit = {}) => {
    const token = await checkAndRefreshToken();
    if (!token) {
        throw new Error('No valid token available');
    }

    const defaultOptions: RequestInit = {
        headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    };

    const response = await fetch(
        `${API_BASE_URL}${endpoint}`, 
        { 
            ...options, 
            ...defaultOptions,
            headers: {
                ...defaultOptions.headers,
                ...options.headers,
            }
        }
    );

    if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
};