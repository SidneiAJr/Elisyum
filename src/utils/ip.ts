import { Request } from 'express';

export function getIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
        return ip.trim();
    }
    return req.socket.remoteAddress ?? '0.0.0.0';
}