# 🎭 Rôles et permissions - GrandsProjets

## Les 3 rôles du système

### 1️⃣ INVITED (Contributeur invité)
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
- ❌ Approuver des contributions
- ❌ Gérer les catégories
- ❌ Inviter des utilisateurs
- ❌ Modifier la structure

**UI spécifique :**
- Message informatif : "Vous voyez vos contributions et celles approuvées de votre équipe. Vous ne pouvez modifier que les vôtres."
- Checkbox "Mes contributions uniquement" visible et fonctionnelle (décochée par défaut)
- Pas d'accès aux boutons de gestion (catégories, utilisateurs, structure)
- Bouton "Modifier" visible uniquement sur ses propres contributions

---

### 2️⃣ ADMIN (Administrateur de structure)
**Scope :** Toutes les contributions de SA structure

**Permissions :**
- ✅ Créer des contributions
- ✅ Voir toutes les contributions de sa structure
- ✅ Modifier toutes les contributions de sa structure
- ✅ Supprimer toutes les contributions de sa structure
- ✅ Approuver/Révoquer les contributions
- ✅ Créer/Modifier/Supprimer des catégories
- ✅ Inviter des utilisateurs
- ✅ Voir les utilisateurs de sa structure
- ✅ Modifier le branding de sa structure

**Restrictions :**
- ❌ Créer une nouvelle structure
- ❌ Rétrograder un autre admin
- ❌ Accéder aux autres structures

**UI spécifique :**
- Checkbox "Mes contributions uniquement" visible et modifiable
- Boutons : Gérer catégories, Gérer utilisateurs, Modifier la structure
- Bouton d'approbation (✓) sur les contributions

---

### 3️⃣ ADMIN GLOBAL (Super administrateur)
**Scope :** TOUTES les structures (cross-city)

**Marqueur technique :** `role: 'admin'` ET `ville: ['global']`

**Permissions :**
- ✅ Toutes les permissions de l'admin pour toutes les structures
- ✅ Créer de nouvelles structures
- ✅ Modifier toutes les structures
- ✅ Gérer les utilisateurs de toutes les structures
- ✅ Rétrograder/Promouvoir des utilisateurs
- ✅ Supprimer des structures

**UI spécifique :**
- Toutes les options de l'admin
- Bouton "Ajouter une structure"
- Bouton "Gérer les villes"

---

## 📊 Matrice des permissions

| Action | Invited | Admin | Admin Global |
|--------|---------|-------|--------------|
| **Contributions** ||||
| Créer | ✅ | ✅ | ✅ |
| Voir les siennes (même non approuvées) | ✅ | ✅ | ✅ |
| Voir celles approuvées de l'équipe | ✅ (sa ville) | ✅ (sa ville) | ✅ (toutes) |
| Voir toutes (même non approuvées) | ❌ | ✅ (sa ville) | ✅ (toutes) |
| Modifier les siennes | ✅ | ✅ | ✅ |
| Modifier celles des autres | ❌ | ✅ (sa ville) | ✅ (toutes) |
| Supprimer les siennes | ✅ | ✅ | ✅ |
| Supprimer celles des autres | ❌ | ✅ (sa ville) | ✅ (toutes) |
| Approuver/Révoquer | ❌ | ✅ (sa ville) | ✅ (toutes) |
| **Catégories** ||||
| Voir | ✅ | ✅ | ✅ |
| Créer/Modifier/Supprimer | ❌ | ✅ (sa ville) | ✅ (toutes) |
| **Utilisateurs** ||||
| Inviter | ❌ | ✅ (sa ville) | ✅ (toutes) |
| Voir la liste | ❌ | ✅ (sa ville) | ✅ (toutes) |
| Rétrograder un admin | ❌ | ❌ | ✅ |
| **Structures** ||||
| Modifier (branding) | ❌ | ✅ (sa ville) | ✅ (toutes) |
| Créer | ❌ | ❌ | ✅ |
| Supprimer | ❌ | ❌ | ✅ |

---

## 🧪 Couverture des tests

Voir `tests/contribution/` pour les tests par rôle.

Chaque fichier de test doit couvrir les 3 rôles quand pertinent :
- Tests communs (tous les rôles)
- Tests spécifiques invited
- Tests spécifiques admin
- Tests spécifiques admin global
