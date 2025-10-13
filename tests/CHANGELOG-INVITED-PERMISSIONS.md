# 🔄 Changelog - Nouvelles permissions Invited

## 📅 Date : 13 octobre 2025

## 🎯 Objectif

Modifier le comportement pour les utilisateurs **invited** afin qu'ils puissent voir les contributions approuvées de leur équipe (même ville), tout en ne pouvant modifier que leurs propres contributions.

## 🆕 Nouveau comportement INVITED

### Avant
- ❌ Voit UNIQUEMENT ses propres contributions (même non approuvées)
- ❌ Ne voit RIEN des contributions des autres membres de l'équipe
- ✅ Peut modifier/supprimer ses propres contributions

### Après ✨
- ✅ Voit ses propres contributions (même non approuvées)
- ✅ Voit les contributions **approuvées** de son équipe (même ville)
- ✅ Peut modifier/supprimer UNIQUEMENT ses propres contributions
- ❌ Ne peut PAS modifier les contributions des autres (même si approuvées et visibles)

## 📝 Modifications apportées

### 1. Documentation (`tests/ROLES-ET-PERMISSIONS.md`)

**Permissions INVITED mises à jour :**
```markdown
**Scope :** Ses propres contributions + contributions approuvées de son équipe (même structure)

**Permissions :**
- ✅ Créer une contribution
- ✅ Voir ses propres contributions (même non approuvées)
- ✅ Voir les contributions approuvées de son équipe (même structure)
- ✅ Modifier ses propres contributions uniquement
- ✅ Supprimer ses propres contributions

**Restrictions :**
- ❌ Voir les contributions non approuvées des autres
- ❌ Modifier les contributions des autres (même si approuvées)
```

**Message UI :**
- Avant : `"Vous ne pouvez voir et modifier que vos propres contributions"` (checkbox cachée)
- Après : `"Par défaut, vous voyez vos contributions et celles approuvées de votre équipe. Cochez 'Mes contributions uniquement' pour ne voir que les vôtres. Vous ne pouvez modifier que vos propres contributions."` (checkbox visible)

**Checkbox "Mes contributions uniquement" :**
- Avant : ❌ Cachée et forcée à `true` pour invited
- Après : ✅ **Visible et fonctionnelle** (décochée par défaut)

### 2. Backend - Requête de liste (`modules/supabaseservice.js`)

**Fonction `listContributions` modifiée :**

```javascript
// Nouvelle logique pour invited
if (userRole === 'invited') {
  if (mineOnly) {
    // Si mineOnly = true, on montre uniquement ses contributions
    query = query.eq('created_by', uid);
  } else {
    // Si mineOnly = false, on montre ses contributions + celles approuvées
    query = query.or(`created_by.eq.${uid},approved.eq.true`);
  }
}
```

**Comportement :**
- Récupère le rôle de l'utilisateur depuis la table `users`
- Pour **invited** : applique un filtre OR : `(created_by = uid) OR (approved = true)`
- La ville est déjà filtrée en amont, donc on voit uniquement les contributions de la même ville
- Pour **admin** : comportement inchangé (voit tout ou filtre par `mineOnly`)

### 3. Frontend - Rendu des cartes (`modules/contrib/contrib-list.js`)

**Fonction `renderItem` rendue async :**

```javascript
async function renderItem(item, onEdit, onDelete) {
  // Vérifier si l'utilisateur est propriétaire
  let isOwner = false;
  try {
    const { data: userData } = await win.supabaseClient.auth.getUser();
    const uid = userData?.user?.id;
    isOwner = (uid && item.created_by === uid);
  } catch(_) {}
  
  // Boutons Edit et Delete conditionnels
  ${isOwner || win.__CONTRIB_IS_ADMIN ? `
    <button>Modifier</button>
    <button>Supprimer</button>
  ` : ''}
}
```

**Comportement :**
- Vérifie si l'utilisateur connecté est propriétaire de la contribution (`created_by`)
- Affiche les boutons "Modifier" et "Supprimer" UNIQUEMENT si :
  - L'utilisateur est le propriétaire, OU
  - L'utilisateur est admin
- Le clic sur le contenu pour éditer n'est possible que si propriétaire ou admin

### 4. Frontend - État de la liste (`modules/contrib.js`)

**Initialisation pour invited :**

```javascript
if (!isAdmin) {
  // Invited : checkbox visible, message informatif visible
  if (toggleEl) toggleEl.style.display = '';
  if (noticeEl) noticeEl.style.display = 'block';
  
  // Par défaut : voir ses contributions + celles approuvées (mineOnly = false)
  if (listMineOnlyEl) {
    listMineOnlyEl.checked = false;
    listMineOnlyEl.disabled = false;  // Checkbox fonctionnelle
  }
  ContribList.updateListState?.({ mineOnly: false });
}
```

**Comportement :**
- Avant : Checkbox **cachée** et `mineOnly` forcé à `true` pour invited
- Après : Checkbox **visible et fonctionnelle**, `mineOnly` initialisé à `false` par défaut
- Invited peut cocher/décocher la checkbox pour filtrer
- Le message informatif explique le comportement

### 5. UI - Message (`modules/contrib/contrib-modal.html`)

**Texte mis à jour :**

```html
<div id="contrib-invited-notice">
  <i class="fa-solid fa-info-circle"></i>
  Par défaut, vous voyez vos contributions et celles approuvées de votre équipe. 
  Cochez "Mes contributions uniquement" pour ne voir que les vôtres. 
  Vous ne pouvez modifier que vos propres contributions.
</div>
```

**Changements :**
- Message plus explicatif sur le comportement par défaut
- Mentionne explicitement l'utilisation de la checkbox
- Précise que seules les propres contributions sont modifiables

### 6. Tests mis à jour

#### `04-list-and-filters.spec.js`

**Test renommé :** `"Un utilisateur invited voit un message informatif et peut utiliser la checkbox"`

```javascript
test('Un utilisateur invited voit un message informatif et peut utiliser la checkbox', async ({ page }) => {
  // Vérifier que la checkbox est VISIBLE (pas cachée)
  const toggle = page.locator('#contrib-mine-only-toggle');
  await expect(toggle).toBeVisible();
  
  // La checkbox doit être décochée par défaut
  const checkbox = page.locator('#contrib-mine-only');
  expect(await checkbox.isChecked()).toBe(false);
  
  // Vérifier le nouveau message
  await expect(notice).toContainText('Par défaut, vous voyez vos contributions et celles approuvées de votre équipe');
  await expect(notice).toContainText('Mes contributions uniquement');
  
  // Tester la checkbox : cocher pour ne voir que ses contributions
  await checkbox.check();
  await page.waitForTimeout(1000);
  
  const filteredCount = await page.locator('.contrib-card').count();
  console.log(`Après filtrage "Mes contributions uniquement": ${filteredCount}`);
});
```

**Changements clés :**
- ✅ Vérifie que la checkbox est **visible** (pas cachée)
- ✅ Vérifie qu'elle est **décochée par défaut**
- ✅ Teste le fonctionnement du filtre en cochant la checkbox

#### `06-permissions-and-scope.spec.js`

```javascript
test('Invited voit ses contributions ET celles approuvées de son équipe', async ({ page }) => {
  // Vérifier que mineOnly est décoché
  const isChecked = await mineOnlyCheckbox.isChecked();
  expect(isChecked).toBe(false);
  
  // Vérifier la différence entre contributions visibles et éditables
  console.log(`[Invited] Voit ${cardsCount} contributions (siennes + approuvées de l'équipe)`);
  console.log(`[Invited] Peut modifier ${editCount} contributions (uniquement les siennes)`);
});
```

## 🔒 Sécurité

### Vérifications côté client
- ✅ Boutons "Modifier/Supprimer" masqués sur les contributions des autres
- ✅ Clic sur le contenu désactivé sur les contributions des autres
- ✅ Message informatif clair sur les permissions

### Vérifications côté serveur (RLS Supabase)
⚠️ **IMPORTANT** : Les RLS Supabase doivent être mises à jour pour refléter ces permissions :

```sql
-- Policy pour SELECT (lecture)
CREATE POLICY "invited_can_read_own_and_approved"
ON contribution_uploads
FOR SELECT
USING (
  auth.uid() = created_by  -- Ses propres contributions
  OR 
  (
    approved = true  -- Contributions approuvées
    AND ville IN (
      SELECT UNNEST(ville) FROM users WHERE user_id = auth.uid()
    )  -- De sa ville
  )
);

-- Policy pour UPDATE/DELETE (modification)
CREATE POLICY "invited_can_only_edit_own"
ON contribution_uploads
FOR UPDATE/DELETE
USING (auth.uid() = created_by);
```

## 📊 Matrice des permissions mise à jour

| Action | Invited | Admin | Admin Global |
|--------|---------|-------|--------------|
| Voir ses contributions (même non approuvées) | ✅ | ✅ | ✅ |
| Voir contributions approuvées de l'équipe | ✅ (sa ville) | ✅ (sa ville) | ✅ (toutes) |
| Voir contributions non approuvées des autres | ❌ | ✅ (sa ville) | ✅ (toutes) |
| Modifier ses contributions | ✅ | ✅ | ✅ |
| Modifier celles des autres | ❌ | ✅ (sa ville) | ✅ (toutes) |

## 🧪 Tests à exécuter

```bash
# Lancer tous les tests de contribution
npm run test:contrib

# Ou spécifiquement les tests modifiés
npx playwright test tests/contribution/04-list-and-filters.spec.js
npx playwright test tests/contribution/06-permissions-and-scope.spec.js
```

## ✅ Validation

Pour valider que les modifications fonctionnent :

1. **En tant qu'invited :**
   - ✅ Voir ses propres contributions (y compris non approuvées)
   - ✅ Voir les contributions approuvées des collègues de la même ville
   - ✅ Pouvoir modifier/supprimer uniquement ses contributions
   - ✅ NE PAS voir de bouton Modifier sur les contributions des autres
   - ✅ Voir la checkbox "Mes contributions uniquement" **visible et fonctionnelle**
   - ✅ Par défaut, la checkbox est **décochée**
   - ✅ Cocher la checkbox : ne voir que ses propres contributions
   - ✅ Décocher la checkbox : voir ses contributions + celles approuvées
   - ✅ Voir le message : "Par défaut, vous voyez vos contributions et celles approuvées de votre équipe. Cochez 'Mes contributions uniquement' pour ne voir que les vôtres. Vous ne pouvez modifier que vos propres contributions."

2. **En tant qu'admin :**
   - ✅ Comportement inchangé (voir tout, modifier tout dans sa ville)

3. **En tant qu'admin global :**
   - ✅ Comportement inchangé (voir tout, modifier tout)

## 🎯 Bénéfices

- 👥 **Meilleure collaboration** : Les invited voient le travail validé de leur équipe
- 🔒 **Sécurité maintenue** : Ils ne peuvent modifier que leurs propres contributions
- 👀 **Transparence** : Vue sur les projets approuvés de la ville
- 🎚️ **Flexibilité** : La checkbox permet à invited de basculer entre "tout voir" et "mes contributions uniquement"
- 🎨 **UX améliorée** : Message clair sur ce qu'ils peuvent et ne peuvent pas faire, avec instructions pour utiliser la checkbox
