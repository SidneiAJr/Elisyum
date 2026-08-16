import express from 'express';
import { elisiumGuard, aplicarTimeoutConexao } from './index';
import { memoryStore } from './store/MemoryStore';

const app = express();
app.use(express.json());

app.use(elisiumGuard({
    cerberus: {
        maxStrikes: 3,
        banTime:    60 * 1000,
        whitelist:  [],
        blacklist:  [],
    },
    caronte: {
        windowMs: 60 * 1000,
        max:      10,
    },
    nemesis: {
        xss:              true,
        sqlInjection:     true,
        commandInjection: true,
        headerInjection:  true,
    },
    hidra: {
        slowloris:        true,
        requestSmuggling: true,
        connectionTimeout: 5000,
        maxHeaderSize:    8192,
    },
    atlas: {
        httpsOnly:    false,
        penalizeHttp: true,
    },
    inteligencia: {
        enabled:           true,
        banScoreThreshold: 80,
    },
    morfeu: {
        onBan: (ip, motivo, hash) => {
            const record = memoryStore.get(ip);
            console.log(
                `🚨 [MORFEU] IP BANIDO: ${ip} | motivo: ${motivo} | req: ${hash} | requests: ${record.requests} | quem baniu: ${motivo.split(' ')[0]}`
            );
        },
    },
}));

app.get('/', (req, res) => {
    res.json({ message: '✨ Mefistófeles te guiou ao Elísio, viajante!' });
});

const server = app.listen(3001, () => {
    console.log('🏛️  Elisium guardando a porta 3001');
});

aplicarTimeoutConexao(server, 5000);