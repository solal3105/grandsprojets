-- Une version enregistrée à l'ouverture d'un dossier reçoit son analyse quand
-- celle-ci se termine, au lieu de rester sans lecture : sinon un collègue ou un
-- autre appareil relançait et repayait toute l'analyse. Un administrateur de la
-- ville pouvait déjà insérer et supprimer ces lignes ; la mise à jour n'élargit
-- pas ses droits et ne permet pas de déplacer une ligne vers une autre ville.
create policy diagnostic_reports_update_admin on public.diagnostic_reports
  for update to authenticated
  using (is_admin_for_ville(ville))
  with check (is_admin_for_ville(ville));
