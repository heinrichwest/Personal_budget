# Personal Budget Management System - System Documentation

## 1. System Overview
 This is a comprehensive Personal Budgeting application designed to manage personal finances, track transactions, and provide automated categorization through a dual-layer mapping system (Global System Rules + Personal Overrides). It is built with React, TypeScript, and Firebase.

## 2. User Roles & Permissions

### **User (Standard)**
*   **Access**: Dashboard, Budget, Transactions, Mappings (Personal).
*   **Capabilities**:
    *   Upload bank statements (CSV/PDF).
    *   View and categorize transactions.
    *   Create **Personal Mapping Rules** to automate categorization.
    *   **Override** System Rules (e.g., map "Woolworths" to "Groceries" instead of the system default "Clothing").
    *   **Ignore** Rules (Create a personal override to "Unmapped").
    *   **Revert to System**: Delete a personal override to restore the global default.

### **Admin**
*   **Access**: All User features + Admin Portal (`/admin`).
*   **Capabilities**:
    *   **User Management**: View users and roles.
    *   **System Mappings**: Create and edit Global Rules that apply to *all* users by default.
    *   **Promote Rules**: Convert a user's personal rule into a System Rule.
    *   **Debug/Restoration**: (Capability to fix broken system data via codebase or temporary tools).

### **System Admin**
*   **Access**: Full technical control.
*   **Note**: Specific dashboard views might be restricted to focus on technical management rather than personal finance views.

---

## 3. Core Modules & Functionality

### **A. Transaction Management (`/transactions`)**
*   **Import**: Users upload statements. The system parses them into standardized `Transaction` objects.
*   **Auto-Categorization**: On import, the **Mapping Engine** runs to assign categories automatically based on Description.
*   **AI Review**: Users can review and approve AI-suggested mappings.
*   **Manual Edit**: Users can manually change a transaction's category, which prompts to create a future Rule.

### **B. Budget Management (`/budget`)**
*   **Categories**: Users define their own Categories (e.g., "House Expenses", "Taxes").
*   **Groups**: Categories are grouped into Income or Expenses.
*   **Budgets**: Users set monthly targets per category.

### **C. Mapping Engine (The Core Logic)**
The system uses a hierarchical rule system to categorize transactions:

1.  **System Rules (Global)**: Defined by Admins. Apply to everyone (e.g., `Netflix` -> `Entertainment`).
2.  **Personal Rules (Override)**: Defined by Users. **Highest Priority**.
    *   *Example*: System maps `Amazon` to `Shopping`. User wants it in `Business Expenses`. User creates a Personal Rule. This overrides the System Rule *only* for that user.

#### **Key Workflows:**
*   **Creating an Override**: When a user changes a category for a transaction already covered by a System Rule, a **Personal Mapping** is created.
*   **Ignoring a Rule**: User clicks "Ignore". A Personal Mapping is created mapping to `Null` (Unmapped).
*   **Reverting to System**: User deletes their Personal Mapping. The system falls back to the System Rule.

#### **Global Category Resolution (Crucial System Behavior)**
*   **Problem**: System Rules are created by Admins using specific Category IDs from *their* budget. Regular users have different Category IDs.
*   **Solution**: The system uses **Name-Based Resolution**.
    *   When a System Rule (e.g., "MES" -> "House Expenses") is applied to User John:
    *   The system looks for a category named "House Expenses" in **John's Budget**.
    *   It retrieves **John's specific Category ID** for that name.
    *   It applies that ID to the transaction.
    *   *Result*: System rules work globally across all users, mapping to their own personal budget structures.

### **D. Reporting & Dashboard**
*   Aggregates transaction data by Category and Group.
*   Compare Actuals vs. Budget.
*   Historical tracking of Income/Expenses.

---

## 4. Technical Architecture

### **Database (Firestore)**
*   `users`: User profiles and roles.
*   `budgets`: Category definitions (one doc per user per year/month or per category structure).
*   `transactions`: Individual line items. Contains `categoryId` and `mappedDescription`.
*   `transactionMappings`: The Rules engine.
    *   Fields: `originalDescription`, `mappedDescription`, `categoryId`, `categoryName`, `userId`.
    *   `userId == 'SYSTEM'`: Global Rule.
    *   `userId == 'uid123'`: Personal Rule.

### **Key Functions (`MappingManagement.tsx`)**
*   `loadMappings()`: Fetches rules. Merges System rules with User overrides for display.
*   `reapplyRuleToHistory()`:
    *   Triggered whenever a rule is created, edited, or deleted.
    *   **Logic**:
        1. Finds the "Winner" rule (Personal > System).
        2. Queries all matching historical transactions for the user.
        3. **Resolves** the correct Category ID dynamically (using the Name-Based Resolution described above).
        4. Batch updates all transactions in the background.
