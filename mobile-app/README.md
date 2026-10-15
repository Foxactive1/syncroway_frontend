# SyncroWay Mobile

Aplicativo Android/iOS com React Native + Expo, usando a identidade roxo + verde-limão do SyncroWay.

## Requisitos

- Node.js LTS
- npm
- Expo Go no Android/iPhone para testar rapidamente

## Executar

Entre nesta pasta e rode:

```bash
npm install
npx expo start
```

Escaneie o QR Code com o Expo Go. Para iniciar no emulador Android, use `npm run android`; no macOS com Xcode, use `npm run ios`.

## API

Por padrão, o app usa `https://syncroway-backend.onrender.com/api`.

Para apontar para outra API, crie `.env` nesta pasta:

```env
EXPO_PUBLIC_API_URL=https://seu-backend.example.com/api
```

Para backend local acessado por um celular físico, use o IP LAN do computador, não `localhost`.

**Importante:** o cliente tenta rotas de catálogo comuns como compatibilidade inicial. Antes de habilitar login, carrinho e checkout reais, confirme os endpoints e o formato exato da API Flask. Tokens devem ser obtidos pelo fluxo de autenticação da API; não coloque chaves privadas no aplicativo.

## Primeira versão incluída

- Home mobile com banner, pesquisa, categorias e catálogo.
- Alternância Produtos/Serviços.
- Estado de carregamento, erro e tentativa novamente.
- Abas Início, Favoritos, Carrinho e Conta (telas iniciais).
- Cartões preparados para imagens reais via `image_url`.
- Integração inicial de leitura da API.

## Próximas etapas

1. Confirmar rotas e modelos reais do backend.
2. Implementar autenticação e persistência segura de sessão.
3. Integrar carrinho, pedidos, pagamentos e notificações.
4. Adicionar testes e configurar builds Android/iOS com EAS.
