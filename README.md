# Automação Fiscal

Emite notas fiscais de devolução no ZipHub a partir de planilhas `.xlsx` e grava o número de cada devolução de volta na planilha.

## Uso

Requer Node 22.20+ (`nvm use`).

```bash
yarn install
yarn dev          # emite as devoluções
yarn gen-sheets   # cria/atualiza planilhas a partir de uma lista de notas
```

As planilhas ficam em `planilhas/`. O prefixo do nome define a conta (`ml1_sac.xlsx` → ML1; os IDs estão em `src/config.ts`). A primeira aba precisa ter na primeira linha os cabeçalhos `NFE` e `NFE_DEV`.

**Feche a planilha no Excel/LibreOffice antes de rodar.** Se ela estiver aberta, o bot ignora o arquivo, porque salvar o Excel depois apagaria o que foi gravado.

## Coluna NFE_DEV

| Valor | Significado | O bot... |
|---|---|---|
| *(vazio)* | não processada | emite no modo **Padrão** |
| número | devolução emitida | ignora |
| `Erro` | falhou e **não** foi emitida | tenta de novo no modo **Recuperação** |
| `VERIFICAR` | resultado incerto (ex.: timeout) | ignora; **confira no ZipHub** |
| `REEMITIR` | digitado à mão | força nova emissão, ignorando o histórico |

Depois de conferir uma nota `VERIFICAR` no ZipHub: se ela foi emitida, digite o número da devolução na célula; se não foi, digite `REEMITIR`.

## Logs

- `logs/error.txt`: erros de cada execução.
- `logs/emissoes.jsonl`: histórico de todo pedido de emissão. Se a planilha for sobrescrita, o bot usa esse histórico para restaurar os números sem emitir de novo. **Não apague esse arquivo.**

## Estrutura

```
src/
  index.ts                 CLI: perguntas e início do processo
  config.ts                contas, status, tempos e caminhos
  types.ts                 tipos das respostas da API
  api/
    client.ts              axios + retry (só GET)
    nfe.ts                 chamadas da API do ZipHub
  sheets/
    spreadsheet.ts         leitura e gravação das planilhas
  emission/
    runEmission.ts         o processo de emissão, nota a nota
    history.ts             histórico de emissões (emissoes.jsonl)
  scripts/
    genSheets.ts           gerador de planilhas
  utils/                   formatação, log e sleep
```
