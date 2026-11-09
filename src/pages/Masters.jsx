import MasterPage from '../components/MasterPage';
import { useAuth } from '../context/AuthContext';
import {
  customerFields, partyBeforeSave, productBeforeSave, productCostFields, productFields, supplierFields,
} from '../lib/masters';

export function Products() {
  const { lists } = useAuth();
  return (
    <MasterPage
      title="Products"
      collName="products"
      mod="products"
      fields={productFields(lists)}
      beforeSave={productBeforeSave}
      cost={{ collection: 'productCosts', fields: productCostFields }}
      intro="Wheels, castors, pallet trucks, trolleys, stackers and raw materials. Prices exclude GST."
    />
  );
}

export function Customers() {
  const { company } = useAuth();
  return (
    <MasterPage
      title="Customers"
      collName="customers"
      mod="customers"
      fields={customerFields(company)}
      beforeSave={partyBeforeSave}
      scoped
      intro="Dealers, distributors, factories and walk-in customers. Each customer belongs to a salesperson."
    />
  );
}

export function Suppliers() {
  return (
    <MasterPage
      title="Suppliers"
      collName="suppliers"
      mod="suppliers"
      fields={supplierFields()}
      beforeSave={partyBeforeSave}
    />
  );
}
