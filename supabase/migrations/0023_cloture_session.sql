-- =============================================================================
-- 0023_cloture_session.sql — une session clôturée ferme la SAISIE, pas la lecture
--
-- La clôture est le seul verrou d'une session : `date_fin` reste prévisionnelle
-- et ne ferme jamais rien toute seule (0022). Clôturer, c'est dire « cette
-- période est arrêtée » — et il faut que cela veuille dire quelque chose.
--
-- Ce qui se ferme : la saisie de NOUVELLES séances, de présences et de notes sur
-- les cours de cette session. 0022 avait déjà fermé la structure (P0061) ; cette
-- migration ferme la pédagogie.
--
-- ⚠️ Ce qui NE se ferme JAMAIS :
--
--   * la lecture, entièrement — séances, présences, notes, examens, progression ;
--   * le RAPPORT, qui doit rester téléchargeable indéfiniment. C'est même la
--     raison d'être d'une session close : on la consulte et on l'imprime ;
--   * la réouverture, d'un clic. Une clôture n'est pas une destruction.
--
-- Le verrou porte sur INSERT et UPDATE, jamais sur DELETE : retirer un pointage
-- posé par erreur reste possible, comme la sortie du refus P0051 de 0020. Une
-- garde qui empêche aussi de réparer force à rouvrir la session pour corriger
-- une faute de frappe.
--
-- Migration idempotente et transactionnelle.
-- =============================================================================

begin;

-- =============================================================================
-- 1. La séance
--
-- `security definer`, comme les gardes de 0020 : en `invoker`, la fonction ne
-- verrait la session qu'à travers la RLS de l'appelant, et une garde qui ne voit
-- qu'une partie de la vérité n'est pas une garde.
-- =============================================================================
create or replace function public.seance_refuser_session_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_session record;
begin
  select s.nom, s.statut into v_session
  from public.cours as c
  join public.session as s on s.id = c.session_id
  where c.id = new.cours_id;

  if v_session.statut = 'terminee' then
    raise exception
      'La session « % » est clôturée : on n''y saisit plus de séance. Rouvrez-la pour corriger.',
      v_session.nom
      using errcode = 'P0062';
  end if;

  return new;
end;
$function$;

alter function public.seance_refuser_session_close() owner to postgres;
revoke all on function public.seance_refuser_session_close() from public, anon, authenticated;

drop trigger if exists seance_refuser_session_close on public.seance;
create trigger seance_refuser_session_close
  before insert or update on public.seance
  for each row execute function public.seance_refuser_session_close();

-- =============================================================================
-- 2. La présence et les notes
--
-- `presence.cours_id` est posé par la base (0012) et pointe le même cours que la
-- séance : on remonte par lui, ce qui évite une jointure de plus et ne peut pas
-- désigner un autre cours.
-- =============================================================================
create or replace function public.presence_refuser_session_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_session record;
begin
  select s.nom, s.statut into v_session
  from public.cours as c
  join public.session as s on s.id = c.session_id
  where c.id = new.cours_id;

  if v_session.statut = 'terminee' then
    raise exception
      'La session « % » est clôturée : on n''y saisit plus de présence ni de note. Rouvrez-la pour corriger.',
      v_session.nom
      using errcode = 'P0062';
  end if;

  return new;
end;
$function$;

alter function public.presence_refuser_session_close() owner to postgres;
revoke all on function public.presence_refuser_session_close() from public, anon, authenticated;

/*
 * ⚠️ Ce trigger doit s'exécuter APRÈS `presence_hydrater_cours` (0012), qui pose
 * `new.cours_id` — sinon il lirait une colonne encore nulle et laisserait tout
 * passer. PostgreSQL déclenche les triggers d'un même événement par ordre
 * ALPHABÉTIQUE de nom : « presence_h… » précède « presence_r… ». Le nom porte
 * donc une dépendance ; ne pas le renommer sans vérifier cet ordre.
 */
drop trigger if exists presence_refuser_session_close on public.presence;
create trigger presence_refuser_session_close
  before insert or update on public.presence
  for each row execute function public.presence_refuser_session_close();

commit;
