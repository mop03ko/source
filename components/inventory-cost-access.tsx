'use client';
import {createContext,useContext} from 'react';
export const InventoryCostAccess=createContext(false);
export const useInventoryCost=()=>useContext(InventoryCostAccess);
