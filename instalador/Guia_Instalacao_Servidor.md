# Instalação e manutenção do InfoBoard no Windows

O roteiro atualizado está em [README.md](README.md), com etapas, códigos de saída, recuperação e limites dos testes.

Para atualizar pelo arquivo recebido no Telegram, salve `ATUALIZAR_INFOBOARD.bat` na pasta instalada do InfoBoard, dê dois cliques, aceite o UAC quando autorizado e confirme a pasta mostrada. O BAT contém seu próprio fluxo; não exige copiar um helper junto. Ele baixa a revisão publicada no GitHub; alterações locais ainda não publicadas não chegam ao servidor.

O projeto exige Node 22 ou superior com npm funcional. Instalador e atualizador verificam o runtime e podem instalar o MSI oficial LTS quando necessário. Quando o Windows exige reinício, o processo informa isso e não avança como se estivesse concluído.

As etapas e os diagnósticos permanecem na tela. Só considere atualização concluída quando houver confirmação do serviço e do HTTP. Preserve `.env`, mapa local e backups privados; nunca os envie ao GitHub ou junto do chamado de suporte.

Os testes automatizados usam pastas temporárias e substituem ações de MSI, serviços e firewall. A validação de implantação real em um Windows de homologação separado deve preceder o uso em produção. Nenhum prazo fixo de atualização é garantido.
