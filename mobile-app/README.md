# SyncroWay Mobile — demonstração para parceiros

Aplicativo Android/iOS em React Native + Expo, com identidade visual roxa e verde-limão.

## O que funciona nesta versão
- Catálogo público integrado às rotas `GET /api/products` e `GET /api/services` do backend SyncroWay.
- Busca local por nome, loja e descrição; filtro de categorias.
- Favoritos persistidos no dispositivo com AsyncStorage.
- Tela de detalhes do item e carrinho demonstrativo com quantidades e subtotal estimado.
- Indicadores de carregamento, conexão, falhas e tentativa novamente.
- Navegação entre Início, Favoritos, Carrinho e Conta.

## Limites importantes para a apresentação
O carrinho é local e serve apenas para demonstrar a experiência. **Não cria pedidos, não calcula frete, não reserva estoque e não processa pagamentos.** Login, notificações reais e acompanhamento de pedidos dependem da integração dos respectivos fluxos no backend. Não apresentar estas funções como operacionais.

## Executar localmente
Requisitos: Node.js LTS e npm.

```bash
cd mobile-app
npm install
npx expo start
```

Abra o projeto pelo Expo Go ou use `npm run android` com o ambiente Android configurado.

## Configuração da API
Por padrão, usa `https://syncroway-backend.onrender.com/api`. Para outro ambiente, crie `.env` nesta pasta:

```env
EXPO_PUBLIC_API_URL=https://sua-api.example.com/api
```

O app espera um backend público com `GET /health`, `GET /products` e `GET /services`. Não inclua segredos ou chaves privadas no aplicativo.

## Preparar APK de teste
1. Instale EAS CLI: `npm install -g eas-cli`.
2. Entre na conta Expo: `eas login`.
3. Configure o projeto com `eas build:configure`.
4. Use um perfil de preview com distribuição interna e build Android APK.
5. Gere com `eas build -p android --profile preview`.

O build na nuvem exige conta Expo e pode exigir configuração de projeto. O APK só estará pronto após a compilação concluir com sucesso; este repositório ainda não contém um APK compilado.

## Checklist antes da reunião
- Testar API e catálogo com a conexão que será usada na apresentação.
- Confirmar que os produtos de demonstração têm nome, preço e imagem válidos.
- Testar favoritos após fechar e abrir o app.
- Testar carrinho, quantidades e subtotal.
- Explicar claramente que checkout/pagamentos e login ainda não estão ativos.
