# dsh-rightbar-quicknav

[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-4c78ff)](https://github.com/deepseek-ai/deepseek-harness)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**Navegação rápida para a barra lateral direita do DeepSeek Harness (DSH): uma trilha vertical de ícones que leva direto a qualquer aba lateral direita.**

> [English](README.md) · [简体中文](README-zh.md) · [日本語](README-ja.md) · [Español](README-es.md) · Português · [हिन्दी](README-hi.md)

## O que resolve

O DSH agrupa cada recurso da barra lateral direita (Arquivos, Git, Tarefas, Terminal, Navegador, Estúdio de imagens, Memória…) numa faixa de abas que você precisa abrir primeiro. Este plugin adiciona uma **trilha de ícones permanente** logo abaixo do botão *abrir barra lateral direita*:

- **Recolhida, mostra apenas 3 ícones** — quase não chama atenção.
- **Ao passar o mouse**, ela se expande para baixo e revela todas as abas disponíveis.
- **Ao passar sobre um ícone**, o título aparece numa bolha compacta.
- **Ao clicar**, a barra lateral direita abre direto naquela aba: um clique em vez de três.

A lista não é fixa: vem do próprio registro de abas do host (`sidebarRightTabs.guide()`), então **qualquer plugin que registre uma aba aparece automaticamente na trilha**.

## Instalação

### Pelo gerenciador de plugins (recomendado)

`Plugins → Adicionar` e aponte para este pacote (tarball do npm ou diretório local). O patch do bundle conecta a metade cliente ao perfil Web / Desktop.

### Manual

```bash
cd ~/.dsh/profiles/<seu-perfil>
pnpm add dsh-rightbar-quicknav
```

Depois **reinicie o DSH por completo** — os módulos cliente são compostos na inicialização, recarregar a página não basta.

## Requisitos

- DSH `>= 0.2.1-rc.1` (precisa dos serviços cliente `sidebarRightTabs` / `sidebarRight`)
- React fornecido pelo host — **sem dependências em tempo de execução** e **sem etapa de build**

## Detalhes de comportamento

| | |
|---|---|
| Posição | borda direita da viewport com `10px`; `50px` abaixo do botão do host |
| Recolhida | 3 ícones |
| Expansão | ao passar o mouse (recolhe 200 ms depois de sair) |
| Bolha | uma linha, largura automática; vira para o outro lado quando não cabe |
| Salto | `sidebarRight.openTab(kind)` |
| Oculta quando | a barra direita já está aberta ou não há sessão na tela |

## Limites de projeto

- Monta **apenas** no slot aditivo `shell.overlay`: nunca cobre nem substitui a interface oficial.
- Todo o visual vai em **estilos inline do React**: o host não expõe serviço `styles`, então CSS por classe simplesmente não faria efeito.
- A geometria é **orientada a eventos** (`MutationObserver` + `ResizeObserver`), sem polling nem layout forçado em regime estável.
- A âncora é o próprio botão do host, localizado pelo atributo estável `data-sidebar-right-expand`, com fallback por `aria-label`; se nenhum casar, usa uma posição padrão e registra um aviso em vez de desaparecer ou ancorar errado.
- Acessível por teclado: `toolbar` com roving tabindex e setas, `Esc` fecha a bolha, o contorno de foco só aparece com teclado.
- Respeita `prefers-reduced-motion`; uma exceção no render é capturada por um ErrorBoundary em vez de deixar o slot em branco.
- Os textos são em chinês e inglês e são registrados no namespace `rightbarQuicknav` quando o host oferece serviço de locale.

## Auditoria

O plugin passou por auditoria completa e uma rodada de correções; tudo está no repositório:

- [`AUDIT-2026-11-06.md`](AUDIT-2026-11-06.md) — auditoria completa: pontuação, achados, plano
- [`AUDIT-a11y.md`](AUDIT-a11y.md) — interação e acessibilidade
- [`AUDIT-perf.md`](AUDIT-perf.md) — desempenho e recursos
- [`AUDIT-2026-11-06-REMEDIATION.md`](AUDIT-2026-11-06-REMEDIATION.md) — verificação e registro das correções

## Desenvolvimento

```bash
node --check client.js     # verificação de sintaxe
node --test tests/         # testes de fumaça de render (sem dependências)
```

O teste de fumaça carrega o `client.js` real e percorre o próprio caminho `apply() → slots.inject → slots.register` com um stub mínimo de React, garantindo que render e efeitos não lancem exceção. Ele existe porque um único identificador indefinido num efeito fez a trilha desaparecer sem qualquer aviso.

## Licença

MIT
