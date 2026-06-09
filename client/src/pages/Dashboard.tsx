import React from 'react';
import PageTitle from '../components/Typography/PageTitle';
import { ChatIcon, CartIcon, MoneyIcon, PeopleIcon } from '../icons';

type IconComponent = React.FC<React.SVGProps<SVGSVGElement>>;

type InfoCardProps = {
  title: string;
  value: string;
  icon: IconComponent;
  iconColorClass: string;
  bgColorClass: string;
};

const InfoCard: React.FC<InfoCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColorClass,
  bgColorClass,
}) => (
  <div className="flex items-center p-4 bg-white rounded-lg shadow-xs dark:bg-gray-800">
    <div className={`p-3 mr-4 rounded-full ${iconColorClass} ${bgColorClass}`}>
      <Icon className="w-5 h-5" aria-hidden="true" />
    </div>
    <div>
      <p className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
      <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">{value}</p>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  return (
    <>
      <PageTitle>Dashboard</PageTitle>

      <div className="grid gap-6 mb-8 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard
          title="Total clients"
          value="6.389"
          icon={PeopleIcon}
          iconColorClass="text-orange-500 dark:text-orange-100"
          bgColorClass="bg-orange-100 dark:bg-orange-500"
        />
        <InfoCard
          title="Account balance"
          value="Rp 46.760.890"
          icon={MoneyIcon}
          iconColorClass="text-green-500 dark:text-green-100"
          bgColorClass="bg-green-100 dark:bg-green-500"
        />
        <InfoCard
          title="New sales"
          value="376"
          icon={CartIcon}
          iconColorClass="text-blue-500 dark:text-blue-100"
          bgColorClass="bg-blue-100 dark:bg-blue-500"
        />
        <InfoCard
          title="Pending contacts"
          value="35"
          icon={ChatIcon}
          iconColorClass="text-teal-500 dark:text-teal-100"
          bgColorClass="bg-teal-100 dark:bg-teal-500"
        />
      </div>

      <div className="p-6 bg-white rounded-lg shadow-xs dark:bg-gray-800">
        <h2 className="mb-2 text-lg font-semibold text-gray-700 dark:text-gray-200">
          Selamat datang di Dashboard
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Data antrian, tabel transaksi, dan chart akan ditampilkan di sini setelah modul
          backend-nya dihubungkan.
        </p>
      </div>
    </>
  );
};

export default Dashboard;
